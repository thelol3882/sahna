// Entry: parse argv, pick the face (menu for a human at a terminal, subcommands for everyone else), run, exit.
import { parseArgs } from "node:util";
import path from "node:path";
import { c } from "./color.js";
import { COMMANDS, VERSION, findCommand } from "./commands.js";
import { DeckError, EXIT, createOutput, envError, envelope, usageError } from "./out.js";
import { findProjectRoot, resolveAssets } from "./project.js";
import { findPython, pythonFix } from "./python.js";

/** Options every command takes. @type {Record<string, import("./commands.js").Opt>} */
export const GLOBAL = {
  json: { type: "boolean", desc: "print one JSON document {ok, command, data, errors[]}; never prompts" },
  quiet: { type: "boolean", short: "q", desc: "no streamed script output (results only)" },
  verbose: { type: "boolean", desc: "with --json: stream script output to stderr" },
  project: { type: "string", short: "C", arg: "dir", desc: "the deck project (default: the folder above cwd that has src/deck/config.ts)" },
  assets: { type: "string", arg: "dir", desc: "the skill's assets folder (default: .sahna.json, SAHNA_ASSETS, or next to this CLI)" },
  help: { type: "boolean", short: "h", desc: "help for a command" },
  version: { type: "boolean", short: "v", desc: "print the version" },
};

/**
 * Split argv into command, options, positionals and the pass-through part after `--`.
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{command: string | null, opts: Record<string, any>, pos: string[], rest: string[]}}
 */
export function parse(argv) {
  const dd = argv.indexOf("--");
  const head = dd === -1 ? argv : argv.slice(0, dd);
  const rest = dd === -1 ? [] : argv.slice(dd + 1);
  // a global option's value could look like a command (`-C new`): find the command after skipping option values
  let command = null;
  for (let i = 0; i < head.length; i++) {
    const a = head[i];
    if (a.startsWith("-")) {
      const name = a.replace(/^--?/, "").split("=")[0];
      const spec = Object.entries(GLOBAL).find(([k, v]) => k === name || v.short === name)?.[1];
      if (spec?.type === "string" && !a.includes("=")) i++;
      continue;
    }
    command = a;
    break;
  }
  const cmd = command ? findCommand(command) : null;
  if (command && !cmd) throw usageError(`unknown command "${command}"`, `sahna --help   (commands: ${COMMANDS.map((x) => x.name).join(", ")})`);
  const options = { ...GLOBAL, ...(cmd?.options ?? {}) };
  /** @type {any} */
  const spec = {};
  for (const [k, v] of Object.entries(options)) spec[k] = { type: v.type, ...(v.short ? { short: v.short } : {}) };
  let parsed;
  try {
    parsed = parseArgs({ args: head, options: spec, allowPositionals: true, strict: true });
  } catch (e) {
    const msg = /** @type {Error} */ (e).message.replace(/\. To specify a positional.*$/s, "").replace(/^Option '([^']+)'/, "option $1");
    throw usageError(msg, `sahna ${command ?? ""} --help`.replace("  ", " "));
  }
  const pos = parsed.positionals.slice();
  if (command) pos.splice(pos.indexOf(command), 1);
  return { command, opts: parsed.values, pos, rest };
}

/** @param {import("./commands.js").Opt} o @param {string} k */
const optLine = (k, o) => `  ${(o.short ? `-${o.short}, ` : "    ") + `--${k}${o.arg ? ` <${o.arg}>` : ""}`.padEnd(26)} ${o.desc}`;

export function mainHelp() {
  const w = Math.max(...COMMANDS.map((x) => x.name.length));
  return [
    `${c.bold("sahna")} ${VERSION} — one CLI for animated-web-deck projects`,
    "",
    `${c.bold("Usage")}`,
    "  npx sahna                     menu (interactive terminal)",
    "  npx sahna <command> [options] e.g. npx sahna check --style all",
    "  npm run sahna -- <command>    the same through npm",
    "",
    c.bold("Commands"),
    ...COMMANDS.map((x) => `  ${x.name.padEnd(w)}  ${x.summary}`),
    "",
    c.bold("Global options"),
    ...Object.entries(GLOBAL).map(([k, o]) => optLine(k, o)),
    "",
    c.bold("Examples"),
    "  npx sahna new my-talk --pack midnight --style showcase --modules diagram",
    "  npx sahna check --style all",
    "  npx sahna export",
    "  npx sahna doctor --fix",
    "",
    `Exit codes: 0 ok · 1 something failed (a check, a build) · 2 usage or environment problem.`,
    `More: sahna <command> --help`,
  ].join("\n");
}

/** @param {import("./commands.js").Command} cmd */
export function commandHelp(cmd) {
  return [
    `${c.bold(`sahna ${cmd.name}`)} — ${cmd.summary}`,
    "",
    c.bold("Usage"),
    `  ${cmd.usage}`,
    ...(cmd.options ? ["", c.bold("Options"), ...Object.entries(cmd.options).map(([k, o]) => optLine(k, o))] : []),
    "",
    c.bold("Global options"),
    "  --json  --quiet  --verbose  --project <dir>  --assets <dir>",
    ...(cmd.examples?.length ? ["", c.bold("Examples"), ...cmd.examples.map((e) => `  ${e}`)] : []),
    ...(cmd.json ? ["", c.bold("--json data"), `  ${cmd.json}`] : []),
  ].join("\n");
}

/** A terminal with a human at it: stdin and stdout are TTYs and nothing says CI. */
export function isInteractive(env = process.env, stdin = process.stdin, stdout = process.stdout) {
  return !!stdin.isTTY && !!stdout.isTTY && !env.CI && env.TERM !== "dumb" && !env.SAHNA_NO_MENU && !env.DECK_NO_MENU;
}

/** Build the ctx a command runs with. @param {ReturnType<typeof parse>} p @param {ReturnType<typeof createOutput>} out */
export function makeCtx(p, out, cwd = process.cwd()) {
  const projectStart = p.opts.project ? path.resolve(cwd, p.opts.project) : cwd;
  /** @type {string | null | undefined} */
  let root;
  /** @type {any} */
  let py;
  const maybeProject = () => (root === undefined ? (root = findProjectRoot(projectStart)) : root);
  return {
    out, opts: p.opts, pos: p.pos, rest: p.rest, cwd, interactive: false,
    maybeProject,
    project: () => {
      const r = maybeProject();
      if (!r) throw envError(`not inside a deck project (no src/deck/config.ts in ${projectStart} or above)`, "cd into the deck folder, pass --project <dir>, or create one: npx sahna new my-talk");
      return r;
    },
    assets: () => {
      const a = resolveAssets({ flag: p.opts.assets, project: maybeProject() });
      if (!a.dir) throw envError(`the skill's assets folder was not found (tried ${a.tried.join("; ")})`, "pass --assets <path to the skill>/assets or set SAHNA_ASSETS");
      return a.dir;
    },
    python: () => {
      if (py) return py;
      const r = findPython({ project: maybeProject() });
      if (!r.python) throw envError(`Python 3.9+ not found (tried ${r.tried.map((t) => `${t.via}: ${t.result}`).join("; ")})`, pythonFix());
      return (py = r.python);
    },
  };
}

/** Run one command; returns the exit code. Never throws. @param {string[]} argv */
export async function main(argv) {
  const wantsJson = argv.includes("--json");
  let out = createOutput({ json: wantsJson });
  let command = "sahna";
  try {
    const p = parse(argv);
    out = createOutput({ json: !!p.opts.json, quiet: !!p.opts.quiet, verbose: !!p.opts.verbose });
    command = p.command ?? "sahna";
    if (p.opts.version) {
      if (out.json) process.stdout.write(JSON.stringify(envelope(command, true, { version: VERSION }, [])) + "\n");
      else console.log(VERSION);
      return EXIT.OK;
    }
    const cmd = p.command ? findCommand(p.command) : null;
    if (p.opts.help) {
      console.log(cmd ? commandHelp(cmd) : mainHelp());
      return EXIT.OK;
    }
    if (!cmd) {
      if (!out.json && isInteractive()) {
        const { menu } = await import("./tui.js");
        return await menu(makeCtx(p, out));
      }
      if (out.json) throw usageError("missing command", "sahna <command> --json   (sahna --help lists them)");
      console.log(mainHelp());
      return EXIT.USAGE;
    }
    const ctx = makeCtx(p, out);
    const data = await cmd.run(ctx);
    const exit = data?.exit ?? (out.errors.length && data?.ok === false ? EXIT.FAIL : EXIT.OK);
    if (data && "exit" in data) delete data.exit;
    if (out.json) process.stdout.write(JSON.stringify(envelope(command, exit === EXIT.OK, data, out.errors), null, 2) + "\n");
    return exit;
  } catch (e) {
    const err = e instanceof DeckError ? e : new DeckError(/** @type {Error} */ (e)?.message ?? String(e), { code: "internal" });
    if (out.json) {
      const errors = [...out.errors, { code: err.code, message: err.message, ...(err.fix ? { fix: err.fix } : {}) }];
      process.stdout.write(JSON.stringify(envelope(command, false, err.data ?? null, errors), null, 2) + "\n");
    } else {
      console.error(`${c.red("✗")} ${err.message}`);
      if (err.fix) console.error(`  ${c.bold("fix:")} ${err.fix}`);
      for (const x of out.errors) console.error(`  ${c.yellow("!")} ${x.message}${x.fix ? ` → ${x.fix}` : ""}`);
      if (err.code === "internal" && (process.env.SAHNA_DEBUG || process.env.DECK_DEBUG)) console.error(/** @type {Error} */ (e)?.stack);
    }
    return err.exit;
  }
}
