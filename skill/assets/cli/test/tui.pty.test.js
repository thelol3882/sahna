// The menu in a real pseudo-terminal (util-linux `script`). Skipped where `script` is missing (Windows, minimal CI).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "sahna.js");
const STARTER = path.resolve(path.dirname(CLI), "..", "..", "starter");
const hasScript = process.platform !== "win32" && spawnSync("script", ["--version"]).status === 0;
const strip = (s) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\r/g, "");

/** Run the menu, answer with keys once `prompt` shows, return the screen text. */
function drive(args, keys) {
  return new Promise((resolve) => {
    const cmd = [process.execPath, CLI, ...args].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ");
    const p = spawn("script", ["-qfec", cmd, "/dev/null"], { env: { ...process.env, TERM: "xterm-256color", CI: "", SAHNA_NO_MENU: "", DECK_NO_MENU: "" } });
    let out = "";
    let sent = 0;
    p.stdout.on("data", (b) => {
      out += b.toString();
      const prompts = (strip(out).match(/What do you want to do\?/g) ?? []).length;
      while (sent < keys.length && prompts > sent) p.stdin.write(keys[sent++]);
    });
    const timer = setTimeout(() => p.kill(), 20000);
    p.on("close", (code) => { clearTimeout(timer); resolve({ code, text: strip(out) }); });
  });
}

test("menu outside a deck: New deck / showreel / packs / Doctor; Up+Enter = Exit", { skip: !hasScript }, async () => {
  const { code, text } = await drive(["-C", path.parse(CLI).root], ["\x1b[A\r"]);
  assert.equal(code, 0);
  for (const s of ["New deck", "Open the showreel", "Doctor", "Exit", "bye"]) assert.ok(text.includes(s), s);
});

test("menu inside a deck shows the deck actions and its dial", { skip: !hasScript }, async () => {
  const { code, text } = await drive(["-C", STARTER], ["\x1b[A\r"]);
  assert.equal(code, 0);
  for (const s of ["Dev server", "Check", "Export PDF + PPTX", "Style dial", "· balanced · en", "Modules", "Rehearsal report", "bye"]) assert.ok(text.includes(s), s);
  assert.ok(!text.includes("Record"), "no recording items without the remote module");
});

test("non-TTY: no menu, help on stdout, exit 2", () => {
  const r = spawnSync(process.execPath, [CLI], { encoding: "utf8", input: "" });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /Usage/);
  const j = spawnSync(process.execPath, [CLI, "--json"], { encoding: "utf8" });
  assert.equal(j.status, 2);
  assert.equal(JSON.parse(j.stdout).errors[0].code, "usage");
});
