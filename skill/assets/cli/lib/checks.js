// `sahna check`: which scripts run for which style, and how their output becomes one summary row each.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { MODULES } from "./modules.js";

export const CHECK_NAMES = ["walk", "overlap", "transitions", "seek", "wow", "modules"];

/**
 * @typedef {{check: string, style: string, label: string, script: string, args: string[], artifacts: string[], parse?: (r: {output: string, code: number}) => any}} Job
 * @param {{root: string, report: string, styles: string[], only: string[], modules: string[], locale: string, url: (q: string) => string, html: string}} o
 * @returns {Job[]}
 */
export function planChecks(o) {
  const jobs = [];
  const has = (c) => o.only.includes(c);
  const r = (...p) => path.join(o.report, ...p);
  for (const st of o.styles) {
    const url = o.url(`style=${st}`);
    if (has("walk")) jobs.push({ check: "walk", style: st, label: `walk ${st}`, script: "scripts/walk.py", args: ["--html", url, "--out", r(st, "walk")], artifacts: [r(st, "walk", "contact.png")] });
    if (has("overlap")) jobs.push({ check: "overlap", style: st, label: `overlap ${st}`, script: "scripts/check_overlap.py", args: ["--html", url], artifacts: [] });
    if (has("transitions")) jobs.push({ check: "transitions", style: st, label: `transitions ${st}`, script: "scripts/check_transitions.py", args: ["--html", o.html, "--style", st], artifacts: [] });
    if (has("wow")) {
      const out = r(st, "wow");
      jobs.push({
        check: "wow", style: st, label: `wow ${st}`, script: "scripts/wow_check.py",
        args: ["--project", o.root, "--html", url, "--style", st, "--out", out],
        artifacts: [path.join(out, "contact.png"), path.join(out, "report.md")],
        parse: () => wowDetails(path.join(out, "report.json")),
      });
    }
  }
  // seek_check loops over the styles itself (one browser per style)
  if (has("seek")) jobs.push({ check: "seek", style: o.styles.join(","), label: "seek", script: "scripts/seek_check.py", args: [o.html, "--styles", o.styles.join(",")], artifacts: [] });
  if (has("modules")) {
    for (const m of o.modules) {
      for (const c of MODULES[m]?.checks ?? []) {
        jobs.push({ check: `module:${m}`, style: o.styles.join(","), label: c.name, script: c.script, args: c.args({ html: o.html, styles: o.styles, locale: o.locale, report: o.report }), artifacts: m === "world" ? [r("world")] : m === "diagram" && c.name.endsWith("shots") ? o.styles.map((s) => path.join(o.root, "shots", `sheet-${s}.png`)) : [] });
      }
    }
  }
  return jobs;
}

/** wow_check's report.json → per-scene verdicts. @param {string} file */
function wowDetails(file) {
  if (!existsSync(file)) return null;
  try {
    const rows = JSON.parse(readFileSync(file, "utf8"));
    return rows.map((x) => ({ id: x.id, appendix: !!x.appendix, classic: !!x.a?.classic, score: x.a?.score, reasons: x.a?.reasons ?? [], warnings: x.a?.warnings ?? [] }));
  } catch { return null; }
}

const FAIL_LINE = /^\s*(FAIL|CLASSIC|ERROR)\b|\bFAIL$|pageerror:|console\.error:|^\s+- \S|Traceback \(most recent call last\)|Error: /;

/**
 * Turn a script's output and exit code into a summary row.
 * @param {string} output @param {number} code
 * @returns {{status: "PASS" | "FAIL", summary: string, fails: string[], oks: number}}
 */
export function parseCheckOutput(output, code) {
  const lines = output.split(/\r?\n/).map((l) => l.replace(/\s+$/, "")).filter(Boolean);
  const fails = lines.filter((l) => FAIL_LINE.test(l) && !/^\s*\d+ FAIL(ED)?$/.test(l)).map((l) => l.trim());
  // a Python traceback: its last line says what broke
  if (lines.some((l) => l.startsWith("Traceback"))) fails.push(lines.at(-1)?.trim() ?? "traceback");
  const oks = lines.filter((l) => /^\s*(ok|\[\w+\] .*(exact|0 wrong))\b/.test(l) || /^ok\s/.test(l)).length;
  const known = [
    /^\d+ checks, \d+ failures, \d+ page errors$/,
    /^\d+ classic, \d+ with warnings/,
    /^\d+ text elements checked, \d+ failures$/,
    /^\d+ failure\(s\)$/,
    /^(PASS|\d+ FAILED)$/,
    /^all ok$/,
    /^\d+ FAIL$/,
  ];
  let summary = [...lines].reverse().find((l) => known.some((k) => k.test(l.trim())))?.trim() ?? "";
  summary = summary.replace(/ → .*$/, "");
  if (!summary || summary === "PASS") summary = code === 0 ? `${oks} ok` : `${fails.length} failed`;
  if (code === 0 && /^PASS$/.test(summary)) summary = `${oks} ok`;
  return { status: code === 0 ? "PASS" : "FAIL", summary, fails: [...new Set(fails)].slice(0, 50), oks };
}

/** report/summary.md @param {any[]} rows @param {{styles: string[], ok: boolean, built: string}} meta */
export function summaryMarkdown(rows, meta) {
  const out = [`# sahna check — ${meta.ok ? "PASS" : "FAIL"}`, "", `Styles: ${meta.styles.join(", ")} · build: ${meta.built}`, "",
    "| check | style | status | result | seconds |", "|---|---|---|---|---|"];
  for (const r of rows) out.push(`| ${r.check.startsWith("module:") ? r.label : r.check} | ${r.style.includes(",") ? "all" : r.style} | ${r.status} | ${r.summary.replace(/\|/g, "/")} | ${r.seconds} |`);
  const failed = rows.filter((r) => r.status !== "PASS");
  if (failed.length) {
    out.push("", "## Failures", "");
    for (const r of failed) {
      out.push(`### ${r.label}`, "", "```", ...r.fails.slice(0, 20), "```", "");
    }
  }
  const arts = rows.flatMap((r) => r.artifacts);
  if (arts.length) out.push("", "## Contact sheets and reports", "", ...arts.map((a) => `- ${a}`));
  return out.join("\n") + "\n";
}
