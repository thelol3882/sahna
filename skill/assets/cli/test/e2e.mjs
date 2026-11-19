// End-to-end run of the CLI on a fresh deck (slow: builds, Chromium checks, export). Not part of `npm test`.
//   node test/e2e.mjs [dir]          default dir: <tmp>/sahna e2e (a space in the path on purpose)
// Each step prints `ok`/`FAIL`, the exit code, and the seconds; exit 1 if any step failed.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "sahna.js");
const dir = path.resolve(process.argv[2] ?? path.join(os.tmpdir(), "sahna e2e"));
rmSync(dir, { recursive: true, force: true });
let failed = 0;

/** @param {string} label @param {string[]} args @param {(j: any) => boolean | string} expect @param {{cwd?: string, viaProject?: boolean}} [o] */
function step(label, args, expect, o = {}) {
  const t0 = Date.now();
  // inside the deck, run the project's own copy (sahna-cli/) the way `npx sahna` does
  const entry = o.viaProject ? path.join(dir, "scripts", "sahna.mjs") : CLI;
  const r = spawnSync(process.execPath, [entry, ...args, "--json"], { cwd: o.cwd ?? (o.viaProject ? dir : os.tmpdir()), encoding: "utf8", maxBuffer: 64 << 20 });
  let j = null;
  try { j = JSON.parse(r.stdout); } catch { /* reported below */ }
  const verdict = j ? expect(j) : "stdout is not JSON";
  const ok = verdict === true;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}  (exit ${r.status}, ${((Date.now() - t0) / 1000).toFixed(1)} s)${ok ? "" : `: ${verdict || "unexpected result"}`}`);
  if (!ok) console.log(JSON.stringify(j ?? { stdout: r.stdout.slice(-2000), stderr: r.stderr.slice(-2000) }, null, 2).slice(0, 4000));
  return j;
}
const shape = (j, cmd) => typeof j.ok === "boolean" && j.command === cmd && "data" in j && Array.isArray(j.errors);

step("new --pack midnight --style showcase --modules diagram,data-viz", ["new", dir, "--pack", "midnight", "--style", "showcase", "--modules", "diagram,data-viz", "--title", 'E2E "deck" ₸'], (j) =>
  shape(j, "new") && j.ok && j.data.style === "showcase" && j.data.pack === "midnight" && j.data.installed && existsSync(path.join(dir, "sahna-cli", "bin", "sahna.js")) && existsSync(path.join(dir, "src", "diagram", "index.ts")) || "deck not created as asked");

step("check --style all (every check, both modules)", ["check", "--style", "all"], (j) => {
  if (!shape(j, "check")) return "bad shape";
  const rows = j.data?.rows ?? [];
  const bad = rows.filter((r) => r.status !== "PASS").map((r) => `${r.label}: ${r.summary}`);
  const names = new Set(rows.map((r) => r.check));
  const all = ["walk", "overlap", "transitions", "seek", "wow", "module:diagram", "module:data-viz"].every((n) => names.has(n));
  return (j.ok && !bad.length && all && existsSync(path.join(dir, "report", "summary.md")) && existsSync(path.join(dir, "report", "showcase", "walk", "contact.png"))) || `failed: ${bad.join("; ") || "missing checks or report"}`;
}, { viaProject: true });

step("export → PDF + PPTX", ["export"], (j) =>
  (shape(j, "export") && j.ok && j.data.pages > 0 && statSync(j.data.pdf).size > 10_000 && statSync(j.data.pptx).size > 10_000) || "no PDF/PPTX", { viaProject: true });

step("style academic", ["style", "academic"], (j) =>
  (shape(j, "style") && j.ok && j.data.style === "academic" && j.data.previous === "showcase" && /style: "academic" as Style/.test(readFileSync(path.join(dir, "src", "deck", "config.ts"), "utf8"))) || "config not edited", { viaProject: true });

step("check --only walk,wow (rebuilds: config changed)", ["check", "--only", "walk,wow"], (j) =>
  (shape(j, "check") && j.ok && j.data.build === "rebuilt" && j.data.styles.join() === "academic" && j.data.rows.length === 2) || "walk/wow failed", { viaProject: true });

step("module add code-scene", ["module", "add", "code-scene"], (j) =>
  (shape(j, "module") && j.ok && j.data.added[0].module === "code-scene" && /codeScene\(\), /.test(readFileSync(path.join(dir, "vite.config.ts"), "utf8"))) || "not installed", { viaProject: true });

step("build (normal + single) with code-scene", ["build"], (j) => (shape(j, "build") && j.ok && j.data.bytes > 100_000) || "build failed", { viaProject: true });

step("doctor", ["doctor"], (j) => (shape(j, "doctor") && Array.isArray(j.data.checks) && j.data.checks.some((c) => c.id === "python" && c.status === "ok")) || "doctor output odd", { viaProject: true });

step("usage error → exit 2 shape", ["style", "loud"], (j) => (shape(j, "style") && !j.ok && j.errors[0].code === "usage") || "no usage error", { viaProject: true });

console.log(failed ? `\n${failed} step(s) FAILED` : "\nE2E OK");
process.exit(failed ? 1 : 0);
