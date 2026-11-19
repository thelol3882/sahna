// The interactive face: `npx sahna` in a terminal. It only gathers choices; the work is the same command
// functions the subcommands run (with a silent output + a spinner, then the result rendered here).
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { c } from "./color.js";
import { COMMANDS, VERSION, findCommand, listPacks, openUrl } from "./commands.js";
import { CHECK_NAMES } from "./checks.js";
import { LOCALES, STYLES } from "./edit.js";
import { MODULES, MODULE_NAMES } from "./modules.js";
import { DeckError, EXIT, createOutput, table } from "./out.js";
import { projectState, resolveAssets } from "./project.js";

/**
 * The menu for a project state. Pure: unit-tested without a terminal.
 * @param {{project: null | {style: string|null, modules: string[], built: boolean, stale: boolean, title: string|null, pack: string|null}, assets: string | null}} s
 * @returns {{value: string, label: string, hint?: string}[]}
 */
export function buildMenu(s) {
  if (!s.project) {
    return [
      { value: "new", label: "New deck", hint: s.assets ? "starter + pack + modules" : "needs the skill's assets folder" },
      { value: "showreel", label: "Open the showreel", hint: "every piece in one deck" },
      { value: "packs", label: "Browse style packs" },
      { value: "doctor", label: "Doctor", hint: "check Node, Python, Chromium …" },
      { value: "exit", label: "Exit" },
    ];
  }
  const p = s.project;
  const items = [
    { value: "dev", label: "Dev server", hint: "live reload; Ctrl+C returns here" },
    { value: "check", label: "Check", hint: p.stale ? "builds first (sources changed)" : "walk, overlap, transitions, seek, wow, modules" },
    { value: "export", label: "Export PDF + PPTX" },
    { value: "open", label: "Open the offline HTML", hint: p.built ? (p.stale ? "rebuilds first" : "dist-single/index.html") : "builds first" },
    { value: "style", label: "Style dial", hint: `now ${p.style}` },
    { value: "packs", label: "Packs", hint: p.pack ? `now ${p.pack}` : "apply or mood board" },
    { value: "modules", label: "Modules", hint: p.modules.length ? p.modules.join(", ") : "none installed" },
    { value: "film", label: "Film transitions", hint: "contact sheets" },
    { value: "rehearse", label: "Rehearsal report" },
  ];
  if (p.modules.includes("remote")) {
    items.push(
      { value: "record", label: "Record", hint: "server, tunnel, phone links" },
      { value: "stop", label: "Stop recording", hint: "stops and mixes" },
      { value: "mix", label: "Mix the latest take" },
      { value: "links", label: "Phone links again" },
    );
  }
  items.push({ value: "doctor", label: "Doctor" }, { value: "exit", label: "Exit" });
  return items;
}

/** @param {import("./commands.js").Ctx} base */
export async function menu(base) {
  // a pseudo-terminal without a size (CI runners, `script`, some Windows hosts) reports 0 columns: clack would wrap every character
  if (!process.stdout.columns) /** @type {any} */ (process.stdout).columns = 80;
  if (!process.stdout.rows) /** @type {any} */ (process.stdout).rows = 24;
  const p = await import("../vendor/clack.mjs");
  const cancelled = (/** @type {unknown} */ v) => p.isCancel(v);
  p.intro(`${c.bold("sahna")} ${c.dim(VERSION)}`);

  /** Run a command silently with a spinner; returns {data, errors, exit}. */
  const runQuiet = async (/** @type {string} */ name, /** @type {Record<string, any>} */ opts, /** @type {string[]} */ pos = [], /** @type {string} */ label = name, /** @type {Record<string, any>} */ over = {}) => {
    const spin = p.spinner();
    spin.start(label);
    const out = createOutput({ json: true, progress: (s) => spin.message(`${label}: ${s}`) });
    const ctx = { ...base, out, opts: { ...base.opts, ...opts }, pos, rest: [], ...over };
    try {
      const data = await /** @type {any} */ (findCommand(name)).run(ctx);
      const exit = data?.exit ?? EXIT.OK;
      spin.stop(exit === EXIT.OK ? `${label}: done` : `${label}: ${c.red("failed")}`, exit === EXIT.OK ? 0 : 1);
      return { data, errors: out.errors, exit };
    } catch (e) {
      const err = e instanceof DeckError ? e : new DeckError(String(/** @type {any} */ (e)?.message ?? e));
      spin.stop(`${label}: ${c.red(err.message)}`, 1);
      if (err.fix) p.log.info(`fix: ${err.fix}`);
      const t = err.data?.tail;
      if (t?.length) p.log.message(c.dim(t.slice(-12).join("\n")));
      return { data: null, errors: [...out.errors, { code: err.code, message: err.message, fix: err.fix }], exit: err.exit };
    }
  };
  /** Run a command that owns the terminal (dev server, recording). */
  const runLive = async (/** @type {string} */ name, /** @type {string[]} */ pos = []) => {
    const ctx = { ...base, out: createOutput({}), pos, rest: [] };
    try { await /** @type {any} */ (findCommand(name)).run(ctx); }
    catch (e) { p.log.error(String(/** @type {any} */ (e)?.message ?? e)); if (e instanceof DeckError && e.fix) p.log.info(`fix: ${e.fix}`); }
  };
  const hints = (/** @type {string[]} */ lines) => lines.length && p.note(lines.join("\n"), "What next");

  for (;;) {
    const root = base.maybeProject();
    const assets = resolveAssets({ flag: base.opts.assets, project: root }).dir;
    const st = root ? projectState(root) : null;
    if (st) p.log.info(`${c.bold(st.title ?? st.name)} ${c.dim(`· ${path.basename(st.root)} · ${st.style} · ${st.locale}${st.pack ? ` · ${st.pack}` : ""}`)}`);
    else p.log.info(c.dim(`no deck in ${base.cwd}`));
    const choice = await p.select({ message: "What do you want to do?", options: buildMenu({ project: st, assets }) });
    if (cancelled(choice) || choice === "exit") { p.outro("bye"); return EXIT.OK; }

    switch (choice) {
      case "new": {
        if (!assets) { p.log.error("the skill's assets folder was not found: run sahna with --assets <skill>/assets"); break; }
        const v = await p.group({
          dir: () => p.text({ message: "Folder for the new deck", placeholder: "my-talk", validate: (x) => (!x?.trim() ? "a folder name, please" : existsSync(path.resolve(base.cwd, x)) ? "that folder exists" : undefined) }),
          title: () => p.text({ message: "Title", placeholder: "Deck title", defaultValue: "" }),
          style: () => p.select({ message: "How bold should it look?", initialValue: "balanced", options: [
            { value: "academic", label: "academic", hint: "juries, teachers, a projector in a lit room" },
            { value: "balanced", label: "balanced", hint: "most talks; dark cover, light content" },
            { value: "showcase", label: "showcase", hint: "pitches, launches, recorded videos" }] }),
          pack: () => p.select({ message: "Style pack", options: [{ value: "", label: "starter default (no pack)" }, ...listPacks(assets).map((k) => ({ value: k.name, label: k.name, hint: `${k.dial} · ${k.fits.slice(0, 3).join(", ")}` }))] }),
          lang: () => p.select({ message: "Language of the talk", options: LOCALES.map((l) => ({ value: l, label: l })) }),
          modules: () => p.multiselect({ message: "Modules (space to toggle, enter to confirm)", required: false, options: MODULE_NAMES.map((m) => ({ value: m, label: m, hint: MODULES[m].summary })) }),
        }, { onCancel: () => {} });
        if (!v || [v.dir, v.style, v.pack, v.lang, v.modules].some(cancelled) || !v.dir) break;
        const opts = { style: v.style, lang: v.lang, ...(v.pack ? { pack: v.pack } : {}), ...(v.title ? { title: v.title } : {}), ...(v.modules?.length ? { modules: v.modules.join(",") } : {}) };
        const r = await runQuiet("new", opts, [v.dir], "Creating the deck");
        if (r.exit === EXIT.OK) {
          base = { ...base, cwd: r.data.dir, maybeProject: () => r.data.dir, project: () => r.data.dir };
          p.log.success(`${r.data.dir}`);
          hints([`npx sahna dev    (from ${r.data.dir})`, "or pick Dev server / Check below"]);
        }
        break;
      }
      case "showreel": {
        if (!assets) { p.log.error("the skill's assets folder was not found: run sahna with --assets <skill>/assets"); break; }
        const sr = path.join(assets, "showreel");
        const built = path.join(sr, "dist-single", "index.html");
        const file = existsSync(built) ? built : existsSync(path.resolve(assets, "..", "showreel.html")) ? path.resolve(assets, "..", "showreel.html") : null;
        if (file) { await openUrl(pathToFileURL(file).href); p.log.success(`opened ${file}`); break; }
        const ok = await p.confirm({ message: "The showreel is not built yet. npm install + build it now (about a minute)?" });
        if (cancelled(ok) || !ok) break;
        const r = await runQuiet("build", { single: true }, [], "Building the showreel", { project: () => sr, maybeProject: () => sr });
        if (r.exit === EXIT.OK) { await openUrl(pathToFileURL(built).href); p.log.success(`opened ${built}`); }
        break;
      }
      case "dev":
        p.log.info("Dev server: Ctrl+C stops it and returns to the menu");
        await runLive("dev");
        break;
      case "check": {
        const style = await p.select({ message: "Which styles?", initialValue: st?.style ?? "balanced", options: [
          { value: st?.style ?? "balanced", label: `this deck's (${st?.style})` }, { value: "all", label: "all three", hint: "before delivery" },
          ...STYLES.filter((x) => x !== st?.style).map((x) => ({ value: x, label: x }))] });
        if (cancelled(style)) break;
        const only = await p.multiselect({ message: "Checks", initialValues: CHECK_NAMES, options: CHECK_NAMES.map((x) => ({ value: x, label: x })) });
        if (cancelled(only) || !only.length) break;
        const r = await runQuiet("check", { style, only: only.join(",") }, [], "Checking");
        if (r.data?.rows) {
          p.log.message(table(["check", "style", "status", "result"], r.data.rows.map((x) => [x.label, x.style.includes(",") ? "all" : x.style, x.status === "PASS" ? c.green("PASS") : c.red("FAIL"), x.summary])));
          for (const x of r.data.rows.filter((y) => y.status !== "PASS")) p.log.warn(`${x.label}\n${x.fails.slice(0, 6).join("\n")}`);
          hints(r.data.ok ? ["Export PDF + PPTX", `contact sheets: ${path.relative(base.cwd, r.data.report)}${path.sep}`] : [`fix the FAIL lines; details: ${path.relative(base.cwd, path.join(r.data.report, "summary.md"))}`]);
        }
        break;
      }
      case "export": {
        const what = await p.select({ message: "Formats", options: [{ value: "both", label: "PDF + PPTX" }, { value: "pdf", label: "PDF" }, { value: "pptx", label: "PPTX" }] });
        if (cancelled(what)) break;
        const r = await runQuiet("export", what === "both" ? {} : { [what]: true }, [], "Exporting");
        if (r.data) { p.log.success(`${r.data.pages} pages\n${[r.data.pdf, r.data.pptx].filter(Boolean).join("\n")}`); hints(["PPTX slides are images: right for viewing and presenting, not for editing"]); }
        break;
      }
      case "open": {
        const r = await runQuiet("open", {}, [], "Opening");
        if (r.data) p.log.success(r.data.opened ? `opened ${r.data.url}` : `open this in Chrome: ${r.data.url}`);
        break;
      }
      case "style": {
        const s = await p.select({ message: "Creative dial", initialValue: st?.style, options: [
          { value: "academic", label: "academic", hint: "light, calm; rise and push" },
          { value: "balanced", label: "balanced", hint: "dark cover/end, overlays at speaker changes" },
          { value: "showcase", label: "showcase", hint: "dark-first, glass, aurora, shaders" }] });
        if (cancelled(s)) break;
        const r = await runQuiet("style", {}, [s], "Setting the dial");
        if (r.data) { p.log.success(`DECK.style = ${s}`); hints(["Check (walk, wow) at the new style", "preview others without editing: ?style=academic"]); }
        break;
      }
      case "packs": {
        if (!assets) { p.log.error("the skill's assets folder was not found"); break; }
        const packs = listPacks(assets);
        p.log.message(table(["pack", "dial", "look", "pitch"], packs.map((k) => [k.name === st?.pack ? c.green(`${k.name} *`) : k.name, k.dial, k.prefers, (k.pitch ?? "").slice(0, 70)])));
        const action = await p.select({ message: "Packs", options: [
          ...(st ? [{ value: "apply", label: "Apply a pack to this deck" }] : []),
          { value: "moodboard", label: "Mood board of 2–3 packs", hint: "your title and points in each look" },
          { value: "lint", label: "Lint every pack" }, { value: "back", label: "Back" }] });
        if (action === "back") break;
        if (cancelled(action)) break;
        if (action === "apply") {
          const name = await p.select({ message: "Pack", options: packs.map((k) => ({ value: k.name, label: k.label ?? k.name, hint: `${k.dial} · ${k.pitch?.slice(0, 60) ?? ""}` })) });
          if (cancelled(name)) break;
          const r = await runQuiet("pack", {}, ["apply", name], `Applying ${name}`);
          if (r.data) { p.log.success(`pack ${r.data.pack} · style ${r.data.style}`); hints(["Check (walk, wow, overlap)"]); }
        } else if (action === "lint") {
          const r = await runQuiet("pack", {}, ["lint"], "Linting packs");
          if (r.data) p.log.message(`${r.data.fails} fail(s), ${r.data.warnings} warning(s)\n${r.data.lines.join("\n")}`);
        } else {
          const pick = await p.multiselect({ message: "Packs to compare (2–3)", options: packs.map((k) => ({ value: k.name, label: k.name, hint: k.dial })) });
          if (cancelled(pick) || !pick.length) break;
          const content = await p.text({ message: "talk.json with the real title and points (empty = sample)", placeholder: "talk.json", defaultValue: "" });
          if (cancelled(content)) break;
          const r = await runQuiet("moodboard", { packs: pick.join(","), ...(content ? { content } : {}) }, [], "Rendering the mood board");
          if (r.data?.grid) { p.log.success(r.data.grid); await openUrl(pathToFileURL(r.data.grid).href); }
        }
        break;
      }
      case "modules": {
        const have = st?.modules ?? [];
        const avail = MODULE_NAMES.filter((m) => !have.includes(m));
        if (!avail.length) { p.log.info("every module is installed"); break; }
        const pick = await p.multiselect({ message: `Add modules${have.length ? ` (installed: ${have.join(", ")})` : ""}`, required: false, options: avail.map((m) => ({ value: m, label: m, hint: MODULES[m].summary })) });
        if (cancelled(pick) || !pick.length) break;
        const r = await runQuiet("module", {}, ["add", ...pick], "Installing modules");
        if (r.data) { p.log.success(r.data.added.map((a) => `${a.module}: ${a.copied} files, edited ${a.edited.join(", ") || "nothing"}`).join("\n")); hints(["Check (modules)", ...pick.flatMap((m) => MODULES[m].after ?? [])]); }
        break;
      }
      case "film": {
        const r = await runQuiet("film", {}, [], "Filming transitions");
        if (r.data) p.log.success(r.data.sheets.join("\n") || "no sheets");
        break;
      }
      case "rehearse": {
        const file = await p.text({ message: "Rehearsal JSON (empty = newest in the project or Downloads)", defaultValue: "" });
        if (cancelled(file)) break;
        const r = await runQuiet("rehearse", {}, ["report", ...(file ? [file] : [])], "Rehearsal report");
        if (r.data) p.log.success(`${r.data.report}\n${r.data.png}`);
        break;
      }
      case "record": case "stop": case "mix": case "links":
        await runLive(choice);
        break;
      case "doctor": {
        const r = await runQuiet("doctor", {}, [], "Checking the environment");
        if (r.data) {
          const mark = { ok: c.green("ok"), warn: c.yellow("warn"), fail: c.red("FAIL"), skip: c.dim("–") };
          p.log.message(table(["", "what", "found"], r.data.checks.map((x) => [mark[x.status], x.label, x.detail])));
          const fixes = r.data.checks.filter((x) => x.fix && x.status !== "ok" && x.status !== "skip");
          if (fixes.length) {
            p.log.warn(fixes.map((x) => `${x.label}: ${x.fix}`).join("\n"));
            const go = await p.confirm({ message: "Install what can be installed safely (pip packages, Chromium, npm install)?" });
            if (!cancelled(go) && go) {
              const f = await runQuiet("doctor", { fix: true }, [], "Fixing");
              if (f.data) p.log.success(f.data.fixed.length ? `fixed: ${f.data.fixed.join("; ")}` : "nothing could be fixed automatically");
            }
          }
        }
        break;
      }
    }
  }
}

export { COMMANDS };
