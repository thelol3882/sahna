/** One line as emitted by the build-time highlighter (vite-plugin-code-scene.ts). */
export type CodeLine = {
  /** token spans; colours are var(--cs-token-*) */
  html: string;
  text: string;
  /** "add": hidden until a diff step, "del": removed by a diff step */
  mark: "" | "add" | "del";
  /** number in the "before" file, null for added lines */
  b: number | null;
  /** number in the "after" file, null for removed lines */
  a: number | null;
};

export type HighlightedCode = { file: string; lang: string; lines: CodeLine[] };

/**
 * A line reference. Numbers and bare strings are lines of the imported source as written
 * (with markers, or the merged before/after rows). Prefix "a:" = numbers of the after file, "b:" = of the before file.
 * Strings may hold ranges and lists: "3-7", "3-5,9", "a:12-14".
 */
export type LineRef = number | string | (number | string)[];

export type CodeStep = {
  /** keep these lines sharp, dim and blur the rest; null clears the focus */
  focus?: LineRef | null;
  /** true = apply every marked line ([!code ++]/[!code --]); or explicit lines of the source */
  diff?: true | { add?: LineRef; remove?: LineRef; collapse?: boolean };
  /** walk the execution marker through these lines in order */
  run?: LineRef;
  /** value notes shown at line ends when the marker reaches the line, e.g. { 9: "→ 42" } */
  values?: Record<string | number, string>;
  /** line to bring to the top of the viewport (clamped) */
  scrollTo?: number | string;
  /** type these lines character by character (the line is empty before this step) */
  type?: LineRef;
  /** seconds per character for `type` (default 0.045) */
  typeSpeed?: number;
  /** side panel text for this step (rendered by <CodePanel steps={...}>) */
  title?: string;
  body?: string;
};
