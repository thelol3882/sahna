// Tiny ANSI colours (picocolors-compatible subset). Off for NO_COLOR, non-TTY stdout, TERM=dumb; FORCE_COLOR wins.
const env = process.env;
const enabled =
  env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "0"
    ? true
    : !("NO_COLOR" in env) && env.TERM !== "dumb" && !!process.stdout.isTTY;

/** @param {number} open @param {number} close */
const wrap = (open, close) => (/** @type {unknown} */ s) => (enabled ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));

export const c = {
  enabled,
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};

/** Visible width of a string (ANSI codes stripped). @param {string} s */
export const width = (s) => s.replace(/\x1b\[[0-9;]*m/g, "").length;
