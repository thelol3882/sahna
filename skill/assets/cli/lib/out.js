// Output for both faces: human lines (colours, tables) or one JSON document {ok, command, data, errors[]}.
import { c, width } from "./color.js";

/** Exit codes: 0 ok, 1 something failed (a check, a build, a script), 2 usage or environment error. */
export const EXIT = { OK: 0, FAIL: 1, USAGE: 2 };

export class DeckError extends Error {
  /**
   * @param {string} message what went wrong, one line
   * @param {{exit?: number, fix?: string, code?: string, data?: any}} [o] fix = the exact command or step that fixes it
   */
  constructor(message, o = {}) {
    super(message);
    this.exit = o.exit ?? EXIT.FAIL;
    this.fix = o.fix;
    this.code = o.code ?? (this.exit === EXIT.USAGE ? "usage" : "failed");
    this.data = o.data;
  }
}

/** @param {string} message @param {string} [fix] */
export const usageError = (message, fix) => new DeckError(message, { exit: EXIT.USAGE, fix, code: "usage" });
/** @param {string} message @param {string} [fix] */
export const envError = (message, fix) => new DeckError(message, { exit: EXIT.USAGE, fix, code: "environment" });

/**
 * @typedef {{code: string, message: string, fix?: string}} ErrorItem
 * @typedef {ReturnType<typeof createOutput>} Out
 */

/** @param {{json?: boolean, quiet?: boolean, verbose?: boolean, progress?: (s: string) => void}} o */
export function createOutput(o = {}) {
  const json = !!o.json;
  const quiet = !!o.quiet;
  /** human text goes to stdout; in --json mode only with --verbose, to stderr (stdout stays pure JSON) */
  const sink = json ? (o.verbose ? process.stderr : null) : process.stdout;
  /** @param {string} s */
  const line = (s) => sink?.write(s + "\n");
  /** @type {ErrorItem[]} */
  const errors = [];
  return {
    json,
    quiet,
    /** @param {string} s */ line,
    /** @param {string} s */ info: (s) => !quiet && line(s),
    /** @param {string} s */ step: (s) => { o.progress?.(s); if (!quiet) line(`${c.cyan("›")} ${s}`); },
    /** long-running work item (the menu's spinner shows it) @param {string} s */ progress: (s) => o.progress?.(s),
    /** @param {string} s */ ok: (s) => line(`${c.green("✓")} ${s}`),
    /** @param {string} s */ warn: (s) => line(`${c.yellow("!")} ${s}`),
    /** @param {string} s */ fail: (s) => line(`${c.red("✗")} ${s}`),
    /** "what next" lines @param {string[]} items */
    next: (items) => {
      if (!items.length || quiet) return;
      line(c.bold("\nNext:"));
      for (const i of items) line(`  ${c.dim("$")} ${i}`);
    },
    /** raw child-process output (streamed in human mode) @param {string | Buffer} chunk */
    raw: (chunk) => {
      if (quiet) return;
      sink?.write(chunk);
    },
    /** collect a non-fatal error for the JSON errors[] (the command still finishes) @param {ErrorItem} e */
    error: (e) => errors.push(e),
    errors,
    /** a table with a header row @param {string[]} head @param {string[][]} rows */
    table: (head, rows) => line(table(head, rows)),
  };
}

/** @param {string[]} head @param {string[][]} rows */
export function table(head, rows) {
  const all = [head, ...rows];
  const w = head.map((_, i) => Math.max(...all.map((r) => width(r[i] ?? ""))));
  const pad = (/** @type {string} */ s, /** @type {number} */ n) => s + " ".repeat(Math.max(0, n - width(s)));
  const fmt = (/** @type {string[]} */ r) => r.map((cell, i) => pad(cell ?? "", w[i])).join("  ").trimEnd();
  return [c.bold(fmt(head)), c.dim(w.map((n) => "─".repeat(n)).join("  ")), ...rows.map(fmt)].join("\n");
}

/** The one JSON shape every command prints with --json. */
export function envelope(command, ok, data, errors) {
  return { ok, command, data: data ?? null, errors: errors ?? [] };
}
