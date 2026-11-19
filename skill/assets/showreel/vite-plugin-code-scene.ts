/**
 * Build-time syntax highlighting for the code scene.
 *
 *   import handler from "./code/handler.go?shiki";                       // inline diff markers
 *   import refactor from "./code/before.go?after=./after.go&shiki";        // before/after pair
 *   import snippet from "./code/x.txt?lang=sql&tab=2&shiki";               // force language / tab width
 *   import sample from "./code/util.ts.txt?shiki";                         // .txt suffix: lang from the name before it
 *
 * Put `shiki` LAST in the query (the TypeScript module declarations match "*?shiki" and "*&shiki").
 *
 * The module that comes out is plain data (token HTML per line), so Shiki never reaches the bundle
 * and the single-file build stays small. Colours are CSS variables (--cs-token-*), set in code-scene.css.
 *
 * Inline markers (removed from the shown code), at the end of a line:
 *   // [!code ++]   # [!code ++]   -- [!code ++]   → added in the diff step
 *   // [!code --]   # [!code --]   -- [!code --]   → removed in the diff step
 *   // +   // -    # +   # -                       → short form (only // and #)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { createHighlighter, createCssVariablesTheme, type Highlighter } from "shiki";

export type CodeLineData = {
  /** token spans, colours as var(--cs-token-*) */
  html: string;
  /** plain text (tabs expanded) */
  text: string;
  /** "add": hidden until a diff step, "del": removed in a diff step */
  mark: "" | "add" | "del";
  /** line number in the "before" file (null for added lines) */
  b: number | null;
  /** line number in the "after" file (null for removed lines) */
  a: number | null;
};

const QUERY = "shiki";
const theme = createCssVariablesTheme({ name: "cs-vars", variablePrefix: "--cs-", variableDefaults: {}, fontStyle: true });

const EXT_LANG: Record<string, string> = {
  go: "go", ts: "ts", tsx: "tsx", js: "js", jsx: "jsx", mjs: "js", py: "python", rs: "rust", rb: "ruby",
  java: "java", kt: "kotlin", swift: "swift", c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp",
  sql: "sql", sh: "bash", bash: "bash", zsh: "bash", yaml: "yaml", yml: "yaml", json: "json", toml: "toml",
  html: "html", css: "css", md: "markdown", dockerfile: "docker", proto: "proto", php: "php", lua: "lua",
  ex: "elixir", exs: "elixir", hs: "haskell", scala: "scala", dart: "dart", zig: "zig", tf: "hcl", txt: "text",
};

const LONG = /\s*(?:\/\/|#|--|;)\s*\[!code (\+\+|--)\]\s*$/;
const SHORT = /\s*(?:\/\/|#)\s?([+-])\s*$/;

function parseMarker(raw: string): { text: string; mark: CodeLineData["mark"] } {
  let m = raw.match(LONG);
  if (m) return { text: raw.slice(0, m.index), mark: m[1] === "++" ? "add" : "del" };
  m = raw.match(SHORT);
  if (m) return { text: raw.slice(0, m.index), mark: m[1] === "+" ? "add" : "del" };
  return { text: raw, mark: "" };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function expandTabs(line: string, tab: number) {
  let out = "";
  for (const ch of line) {
    if (ch === "\t") out += " ".repeat(tab - (out.length % tab));
    else out += ch;
  }
  return out;
}

function trimEnds(lines: string[]) {
  // drop one trailing empty line (files end with \n)
  if (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  return lines;
}

/** Highlight lines → token HTML per line. */
function highlight(hl: Highlighter, lines: string[], lang: string): string[] {
  const { tokens } = hl.codeToTokens(lines.join("\n"), { lang: lang as never, theme: "cs-vars" });
  return tokens.map((line) =>
    line
      .map((t) => {
        const st: string[] = [];
        if (t.color) st.push(`color:${t.color}`);
        const fs = t.fontStyle ?? 0;
        if (fs & 1) st.push("font-style:italic");
        if (fs & 2) st.push("font-weight:700");
        if (fs & 4) st.push("text-decoration:underline");
        return st.length ? `<span style="${st.join(";")}">${esc(t.content)}</span>` : esc(t.content);
      })
      .join(""),
  );
}

/** Line diff (LCS) between two files → merged rows. */
function diffLines(a: string[], b: string[]) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i].trimEnd() === b[j].trimEnd() ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: { kind: "eq" | "del" | "add"; i: number; j: number }[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i].trimEnd() === b[j].trimEnd()) { out.push({ kind: "eq", i, j }); i++; j++; }
    // on a tie, removed lines come before added ones (like a unified diff)
    else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) { out.push({ kind: "del", i, j: -1 }); i++; }
    else { out.push({ kind: "add", i: -1, j }); j++; }
  }
  return out;
}

function numberRows(rows: Omit<CodeLineData, "a" | "b">[]): CodeLineData[] {
  let b = 0, a = 0;
  return rows.map((r) => ({ ...r, b: r.mark === "add" ? null : ++b, a: r.mark === "del" ? null : ++a }));
}

export function codeScene(opts: { langs?: string[]; defaultTab?: number } = {}): Plugin {
  let hl: Promise<Highlighter> | null = null;
  const getHl = () => (hl ??= createHighlighter({ themes: [theme], langs: opts.langs ?? [] }));

  return {
    name: "code-scene-shiki",
    enforce: "pre",
    async load(id) {
      const [file, qs] = id.split("?", 2);
      if (!qs) return null;
      const params = new URLSearchParams(qs);
      if (!params.has(QUERY)) return null;

      // "x.ts.txt" → ts: a .txt suffix keeps code samples out of the type checker and the linters
      const base = path.basename(file).toLowerCase().replace(/\.txt$/, "");
      const ext = path.extname(base).slice(1) || base;
      const lang = params.get("lang") ?? EXT_LANG[ext] ?? ext;
      const tab = Number(params.get("tab") ?? opts.defaultTab ?? 4);
      const h = await getHl();
      if (lang !== "text" && !h.getLoadedLanguages().includes(lang)) await h.loadLanguage(lang as never);

      this.addWatchFile(file);
      const src = readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
      let lines: CodeLineData[];
      const afterRel = params.get("after");

      if (afterRel) {
        const afterFile = path.resolve(path.dirname(file), afterRel);
        this.addWatchFile(afterFile);
        const before = trimEnds(src.split("\n").map((l) => expandTabs(l, tab)));
        const after = trimEnds(readFileSync(afterFile, "utf8").replace(/\r\n?/g, "\n").split("\n").map((l) => expandTabs(l, tab)));
        const hb = highlight(h, before, lang);
        const ha = highlight(h, after, lang);
        lines = diffLines(before, after).map((d) =>
          d.kind === "add"
            ? { html: ha[d.j], text: after[d.j], mark: "add" as const, b: null, a: d.j + 1 }
            : d.kind === "del"
              ? { html: hb[d.i], text: before[d.i], mark: "del" as const, b: d.i + 1, a: null }
              : { html: ha[d.j], text: after[d.j], mark: "" as const, b: d.i + 1, a: d.j + 1 },
        );
      } else {
        const parsed = trimEnds(src.split("\n")).map((l) => {
          const p = parseMarker(l);
          return { text: expandTabs(p.text.trimEnd(), tab), mark: p.mark };
        });
        const html = highlight(h, parsed.map((p) => p.text), lang);
        lines = numberRows(parsed.map((p, i) => ({ html: html[i] ?? esc(p.text), text: p.text, mark: p.mark })));
      }

      // shown name: the after file of a pair, without a .txt suffix
      const shown = path.basename(afterRel ? path.resolve(path.dirname(file), afterRel) : file).replace(/\.txt$/i, "");
      const data = { file: shown, lang, lines };
      return `export default ${JSON.stringify(data)};`;
    },
  };
}

export default codeScene;
