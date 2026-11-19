// npm run record → node remote/run.mjs --record: finds Python (python3, python or py -3) and runs start.py.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const script = join(dirname(fileURLToPath(import.meta.url)), "start.py");
const args = process.argv.slice(2);
const candidates = process.platform === "win32" ? [["py", "-3"], ["python"], ["python3"]] : [["python3"], ["python"]];
for (const [cmd, ...pre] of candidates) {
  const r = spawnSync(cmd, [...pre, script, ...args], { stdio: "inherit" });
  if (r.error && r.error.code === "ENOENT") continue;
  process.exit(r.status ?? 1);
}
console.error("Python 3 is not installed: https://www.python.org/downloads/");
process.exit(1);
