import type { CSSProperties } from "react";
import type { CodeStep, HighlightedCode } from "./types";

export type CodeBlockProps = {
  code: HighlightedCode;
  /** px on the 1920 stage; keep ≥ 24 (default 26) */
  fontSize?: number;
  /** row height as a multiple of fontSize (default 1.5) */
  lineHeight?: number;
  /** visible rows in the viewport; longer code scrolls (default: all rows, at most `maxLines`) */
  lines?: number;
  /** cap for the viewport (default 16; above ~18 the text gets too small to read on a projector) */
  maxLines?: number;
  /** show line numbers (default true) */
  numbers?: boolean;
  /** title in the header bar (default: the file name); false hides the header */
  title?: string | false;
  /** "auto" follows a .dark or .hero ancestor */
  theme?: "auto" | "light" | "dark";
  className?: string;
  style?: CSSProperties;
};

const PAD = 18; // px above the first and below the last row

/**
 * A highlighted code block for a scene. Static by itself; animate it with codeIn() and codeSteps().
 * Rows that are added by a diff step start collapsed once codeSteps() runs.
 */
export function CodeBlock({
  code, fontSize = 26, lineHeight = 1.5, lines, maxLines = 16, numbers = true, title, theme = "auto", className = "", style,
}: CodeBlockProps) {
  const row = Math.round(fontSize * lineHeight);
  const viewRows = lines ?? Math.min(maxLines, code.lines.length);
  const digits = String(code.lines.length).length;
  const head = title === false ? null : (title ?? code.file);
  return (
    <div
      className={`cs-root ${className}`}
      data-theme={theme}
      data-row={row}
      data-pad={PAD}
      data-numbers={numbers ? "1" : "0"}
      style={{
        "--cs-fs": `${fontSize}px`,
        "--cs-row": `${row}px`,
        "--cs-pad": `${PAD}px`,
        "--cs-gut": numbers ? `${digits + 2.4}ch` : "1.4ch",
        ...style,
      } as CSSProperties}
    >
      {head && (
        <div className="cs-head">
          <span className="cs-dots" aria-hidden><i /><i /><i /></span>
          <span className="cs-file">{head}</span>
          <span className="cs-lang">{code.lang}</span>
        </div>
      )}
      <div className="cs-view" style={{ height: viewRows * row + PAD * 2 }}>
        <div className="cs-body">
          <div className="cs-focusbar" />
          <div className="cs-runbar" />
          <div className="cs-runmark" />
          {code.lines.map((l, i) => (
            <div
              key={i}
              className="cs-row"
              data-mark={l.mark}
              data-a={l.a ?? ""}
              data-b={l.b ?? ""}
              data-len={Array.from(l.text).length}
            >
              <div className="cs-tint" />
              <span className="cs-gut" dangerouslySetInnerHTML={{ __html: numbers && l.mark !== "add" ? String(l.b ?? "") : "" }} />
              <span className="cs-sign" dangerouslySetInnerHTML={{ __html: "" }} />
              <span className="cs-code" dangerouslySetInnerHTML={{ __html: `<span class="cs-txt">${l.html || " "}</span>` }} />
            </div>
          ))}
        </div>
        <div className="cs-scroll"><div className="cs-thumb" /></div>
        <div className="cs-fade" />
      </div>
    </div>
  );
}

/**
 * Explanation card next to the code, synced with the steps by codeSteps():
 * item 0 = after the entrance (`intro`), item k = after step k (`steps[k-1].title/body`).
 * A step without title/body keeps the previous text.
 */
export function CodePanel({
  steps, intro, eyebrow, className = "", style,
}: { steps: CodeStep[]; intro?: { title: string; body?: string }; eyebrow?: string; className?: string; style?: CSSProperties }) {
  const items = [intro, ...steps.map((s) => (s.title || s.body ? { title: s.title ?? "", body: s.body } : undefined))];
  return (
    <div className={`cs-panel ${className}`} style={style}>
      {eyebrow && <span className="cs-peyebrow">{eyebrow}</span>}
      <div className="cs-pstack">
        {items.map((it, k) =>
          it ? (
            <div key={k} className="cs-pitem" data-k={k}>
              <h3 className="cs-ptitle">{it.title}</h3>
              {it.body && <p className="cs-pbody">{it.body}</p>}
            </div>
          ) : null,
        )}
      </div>
      <div className="cs-pdots" aria-hidden>
        {steps.map((_, k) => (
          <span key={k} className="cs-pdot" data-k={k + 1}><i /></span>
        ))}
      </div>
    </div>
  );
}
