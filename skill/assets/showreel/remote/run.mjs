// npm run record | links | stop | mix → node remote/run.mjs --record | --links | --stop | --mix [args]:
// finds Python 3 (py -3, python or python3) and runs remote/start.py with the same arguments.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const script = join(dirname(fileURLToPath(import.meta.url)), "start.py");
const args = process.argv.slice(2);
const candidates = process.platform === "win32" ? [["py", "-3"], ["python"], ["python3"]] : [["python3"], ["python"]];
for (const [cmd, ...pre] of candidates) {
  const r = spawnSync(cmd, [...pre, "-u", script, ...args], { stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  if (r.error && r.error.code === "ENOENT") continue;
  // the Microsoft Store stub "python" exits with 9009 and prints nothing useful: try the next one
  if (process.platform === "win32" && r.status === 9009) continue;
  process.exit(r.status ?? 1);
}
console.error("Python 3 is not installed: https://www.python.org/downloads/ (tick \"Add python.exe to PATH\"), then run the npm command again.");
process.exit(1);
