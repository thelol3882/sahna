# code-scene

Animated code for the animated-web-deck engine: build-time Shiki highlighting, and step helpers that put
focus / diff / run / scroll / typing into the scene's one paused timeline (labels `s1`, `s2`, …).

```tsx
import { CodeBlock, CodePanel, codeIn, codeSteps, type CodeStep } from "../code-scene";
import handler from "./code/handler.go?shiki";

const STEPS: CodeStep[] = [
  { focus: "11-25", title: "One handler", body: "…" },
  { diff: true, focus: "12-17" },
  { focus: null, run: [12, 13, 14, 17, 18, 24], values: { 17: "38 ms", 24: "200 OK" } },
  { diff: { add: [23] }, type: 23 },
];

export function CodeHandler() {
  const ref = useScene((tl, q) => {
    codeIn(tl, q, 0.3);          // entrance
    tl.addLabel("s0", "+=0.1");
    codeSteps(tl, q, STEPS);     // s1 … s4
  });
  return (
    <SceneRoot ref={ref}>
      <CodeBlock code={handler} lines={14} className="absolute left-[120px] top-[330px] w-[1180px]" />
      <CodePanel steps={STEPS} intro={{ title: "GetUser" }} className="absolute left-[1340px] top-[330px] w-[460px] h-[642px]" />
    </SceneRoot>
  );
}
```

See NOTES.md for install steps, the full API and the gotchas.

## Fonts: mono only for code

The code block uses `--cs-font` (default: the deck's `--font-mono`). Mono is for code and English terms only;
local-language text never goes in the mono class. If code comments or strings contain local-language text,
the mono font must cover it, or the browser falls back to another font: the line loses its fixed width,
typing (which reveals `1ch` per character) cuts glyphs, and the line looks broken. Either use a covering font
or keep comments/strings in the code English.

Checked with fonttools on the Fontsource packages (v5.3, weight 400, all subsets together), for Kazakh
`ә ғ қ ң ө ұ ү һ і` (upper and lower case) and Russian:

| Font (Fontsource) | Basic Cyrillic | Kazakh / extended Cyrillic |
|---|---|---|
| IBM Plex Mono | yes | yes |
| Fira Code / Fira Mono | yes | yes |
| Roboto Mono | yes | yes |
| Source Code Pro | yes | yes |
| Noto Sans Mono | yes | yes |
| PT Mono | yes | yes |
| Ubuntu Mono | yes | yes |
| Geist Mono | yes | yes |
| Victor Mono | yes | yes |
| Cousine | yes | yes |
| **JetBrains Mono** | yes | **no** (missing ә ғ қ ң ұ һ) |
| Martian Mono | yes | no (missing ә ғ қ ң ө ұ ү һ) |
| DM Mono, Red Hat Mono, Space Mono, Inconsolata | no | no |

Import the `cyrillic` and `cyrillic-ext` subsets of the chosen font (e.g. `@fontsource/ibm-plex-mono/cyrillic-ext-400.css`),
and preload it with `document.fonts.load('400 26px "IBM Plex Mono"', "әғқңөұүһі")` before mounting.
Wide glyphs (CJK, emoji) are not one `ch` wide: do not type such lines.
