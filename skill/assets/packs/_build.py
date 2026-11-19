"""Source of the style packs. Edit a pack here, then run `python packs/_build.py` to rewrite
packs/<name>/{theme.css, pack.css, pack.json, fonts.json} and `python scripts/pack_lint.py` to check them.

Every pack fills the SAME token schema (TOKENS below), so any pack drops into the starter without code changes.
Light values are always present (content scenes are light unless DECK.style is showcase); the dark block
(`.dark, .scene.hero`) only where the pack has a dark look (prefers: "dark", or a useful dark variant). Without it,
hero scenes use the light slots on --hero-bg (paper, calm: the hero is light too).
"""
from __future__ import annotations

import sys as _sys
for _stream in (_sys.stdout, _sys.stderr):  # a Windows console in cp1252 must not crash on arrows or Kazakh text
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
SUBSETS = ["latin", "latin-ext", "cyrillic", "cyrillic-ext"]

# colour slots every pack must fill (light block); the .dark block overrides the same names
COLOR_SLOTS = [
    "canvas", "surface", "sunken", "ink", "ink-2", "muted", "line", "line-strong",
    "primary", "primary-soft", "primary-ink", "on-primary", "accent", "accent-soft", "on-accent",
    "success", "warning", "danger", "highlight",
    "hero", "hero-ink", "hero-muted", "hero-line", "hero-accent",
    "mark", "track", "scrim", "glow", "grid",
    "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
]


def face(family, package, weights, local_text=True, role_note=""):
    return {"family": family, "package": package, "weights": weights, "subsets": SUBSETS, "local_text": local_text, "note": role_note}


PACKS: dict[str, dict] = {}

# ---------------------------------------------------------------- 1. Midnight product
PACKS["midnight"] = dict(
    label="Midnight Product",
    pitch="Dark, precise product launch. Light is a material: hairline edges catch a cool glow, one warm filament accent.",
    prefers="dark", dial="showcase", fits=["product pitch", "demo day", "dev tools", "SaaS"],
    fonts=dict(
        display=face("Onest", "@fontsource/onest", [500, 600, 700]),
        sans=face("Onest", "@fontsource/onest", [400, 500, 600]),
        mono=face("Geist Mono", "@fontsource/geist-mono", [400, 500], role_note="labels, code; covers Kazakh, no ₸ glyph"),
    ),
    label_font="mono",
    light={
        "canvas": "#F4F5F7", "surface": "#FFFFFF", "sunken": "#E9EBEF", "ink": "#0B0D12", "ink-2": "#343844", "muted": "#5E6472",
        "line": "#DADDE3", "line-strong": "#A4A9B4", "primary": "#3A54E0", "primary-soft": "#E7EBFD", "primary-ink": "#2A3FB5",
        "on-primary": "#FFFFFF", "accent": "#B35A06", "accent-soft": "#FCEBD8", "on-accent": "#FFFFFF",
        "success": "#16834A", "warning": "#A66F00", "danger": "#C42B38", "highlight": "#FFE08A",
        "hero": "#050608", "hero-ink": "#F3F4F7", "hero-muted": "#9097A6", "hero-line": "#1A1D24", "hero-accent": "#9DB2FF",
        "mark": "#FF2D3D", "track": "rgb(11 13 18 / 0.14)", "scrim": "rgb(5 6 8 / 0.66)",
        "glow": "rgb(90 115 255 / 0.28)", "grid": "rgb(11 13 18 / 0.06)",
        "chart-1": "#3A54E0", "chart-2": "#B35A06", "chart-3": "#0F8C7A", "chart-4": "#8A4FD8", "chart-5": "#A4A9B4",
    },
    dark={
        "canvas": "#08090C", "surface": "#101218", "sunken": "#050608", "ink": "#EDEEF2", "ink-2": "#B9BDC8", "muted": "#8A90A0",
        "line": "#1E2129", "line-strong": "#343845", "primary": "#9DB2FF", "primary-soft": "#161C33", "primary-ink": "#C0CDFF",
        "on-primary": "#0A0F24", "accent": "#FFB86B", "accent-soft": "#2B1D0E", "on-accent": "#241300",
        "success": "#4CD08A", "warning": "#F0BE4A", "danger": "#FF6B76", "highlight": "#5C4A12",
        "mark": "#FF4655", "track": "rgb(237 238 242 / 0.14)", "scrim": "rgb(0 0 0 / 0.72)",
        "glow": "rgb(140 165 255 / 0.40)", "grid": "rgb(255 255 255 / 0.05)",
        "chart-1": "#9DB2FF", "chart-2": "#FFB86B", "chart-3": "#5FE0C8", "chart-4": "#C79BFF", "chart-5": "#5A6072",
    },
    hero_bg="radial-gradient(1100px 620px at 72% -12%, rgb(110 135 255 / 0.24), transparent 62%), radial-gradient(900px 520px at 8% 112%, rgb(255 184 107 / 0.10), transparent 60%), var(--color-hero)",
    type=dict(display=(148, 0.98, "-0.045em", 600), h1=(80, 1.04, "-0.035em", 600), h2=(40, 1.18, "-0.02em", 600),
              stat=(168, 0.92, "-0.05em", 500), body_l=(30, 1.45), body_m=(24, 1.45), label=(20, "0.12em", "uppercase")),
    radius=dict(card=20, chip=999, frame=16),
    shadow=dict(sm="0 1px 2px rgb(10 12 20 / 0.06), 0 8px 24px rgb(10 12 20 / 0.06)",
                lg="0 24px 80px rgb(10 12 20 / 0.20)", glow="0 0 0 1px rgb(157 178 255 / 0.25), 0 0 48px rgb(110 135 255 / 0.30)"),
    shadow_dark=dict(sm="0 1px 0 rgb(255 255 255 / 0.05) inset, 0 8px 28px rgb(0 0 0 / 0.5)",
                     lg="0 1px 0 rgb(255 255 255 / 0.06) inset, 0 30px 90px rgb(0 0 0 / 0.65)", glow="0 0 0 1px rgb(157 178 255 / 0.35), 0 0 60px rgb(110 135 255 / 0.35)"),
    card=dict(bg="var(--color-surface)", border="1px solid var(--color-line)"),
    card_dark=dict(bg="linear-gradient(180deg, rgb(255 255 255 / 0.045), rgb(255 255 255 / 0.012)), var(--color-surface)", border="1px solid rgb(255 255 255 / 0.08)"),
    motion=dict(enter="expo.out", move="power3.inOut", exit="power2.in", fast=0.35, base=0.8, slow=1.2, stagger=0.05,
                css_enter="cubic-bezier(0.16, 1, 0.3, 1)", css_move="cubic-bezier(0.65, 0, 0.35, 1)"),
    transitions=dict(grammar="A at speaker changes, B inside a part", speaker=["circle", "zoom", "split"], within="rise",
                     showcase="a shader transition at 2-3 speaker changes (falls back to circle)"),
    signature="window",
    do=["Let light do the work: a hairline edge, a glow behind ONE element per scene, a soft top light on the hero.",
        "Keep data scenes on the light content palette unless DECK.style is showcase.",
        "Use the warm accent once per scene: the number or word the audience must keep."],
    dont=["No neon outlines on every card; no glow on text.",
          "No purple-to-pink gradients, they read as stock AI branding.",
          "Do not put body text under 24 px on the near-black canvas (projectors crush it)."],
)

# ---------------------------------------------------------------- 2. Swiss editorial
PACKS["swiss"] = dict(
    label="Swiss Grid",
    pitch="Editorial grid, huge type, one signal red. Structure and scale carry the story, not effects.",
    prefers="light", dial="balanced", fits=["research with a strong claim", "design", "humanities", "keynote"],
    fonts=dict(
        display=face("Inter Tight", "@fontsource/inter-tight", [600, 700, 800]),
        sans=face("Inter", "@fontsource/inter", [400, 500, 600]),
        mono=face("IBM Plex Mono", "@fontsource/ibm-plex-mono", [500]),
    ),
    label_font="mono",
    light={
        "canvas": "#FAFAF7", "surface": "#FFFFFF", "sunken": "#EFEFEA", "ink": "#0A0A0A", "ink-2": "#2B2B2B", "muted": "#5C5C5A",
        "line": "#DCDCD6", "line-strong": "#0A0A0A", "primary": "#D42A10", "primary-soft": "#FBE3DD", "primary-ink": "#A8200B",
        "on-primary": "#FFFFFF", "accent": "#0A0A0A", "accent-soft": "#EFEFEA", "on-accent": "#FFFFFF",
        "success": "#1E7A45", "warning": "#9C6B00", "danger": "#D42A10", "highlight": "#FFE45C",
        "hero": "#0A0A0A", "hero-ink": "#FAFAF7", "hero-muted": "#A3A3A0", "hero-line": "#262626", "hero-accent": "#FF4A2B",
        "mark": "#FF2D3D", "track": "rgb(10 10 10 / 0.14)", "scrim": "rgb(10 10 10 / 0.66)",
        "glow": "rgb(212 42 16 / 0.18)", "grid": "rgb(10 10 10 / 0.07)",
        "chart-1": "#D42A10", "chart-2": "#0A0A0A", "chart-3": "#8C8C88", "chart-4": "#C9C9C3", "chart-5": "#5C5C5A",
    },
    dark={
        "canvas": "#0C0C0C", "surface": "#151515", "sunken": "#060606", "ink": "#F4F4F0", "ink-2": "#CFCFCA", "muted": "#9A9A96",
        "line": "#2A2A2A", "line-strong": "#F4F4F0", "primary": "#FF5638", "primary-soft": "#3A130C", "primary-ink": "#FF8A73",
        "on-primary": "#0C0C0C", "accent": "#F4F4F0", "accent-soft": "#202020", "on-accent": "#0C0C0C",
        "success": "#4CC37E", "warning": "#E8B53C", "danger": "#FF5638", "highlight": "#5A4E0E",
        "mark": "#FF4655", "track": "rgb(244 244 240 / 0.16)", "scrim": "rgb(0 0 0 / 0.72)",
        "glow": "rgb(255 86 56 / 0.25)", "grid": "rgb(255 255 255 / 0.06)",
        "chart-1": "#FF5638", "chart-2": "#F4F4F0", "chart-3": "#8C8C88", "chart-4": "#4A4A48", "chart-5": "#CFCFCA",
    },
    hero_bg="var(--color-hero)",
    type=dict(display=(184, 0.9, "-0.055em", 800), h1=(88, 1.0, "-0.045em", 700), h2=(40, 1.15, "-0.02em", 700),
              stat=(220, 0.86, "-0.06em", 800), body_l=(30, 1.42), body_m=(24, 1.42), label=(18, "0.08em", "uppercase")),
    radius=dict(card=2, chip=2, frame=2),
    shadow=dict(sm="none", lg="0 20px 60px rgb(0 0 0 / 0.12)", glow="none"),
    card=dict(bg="var(--color-surface)", border="0 solid transparent", top_rule="3px solid var(--color-ink)"),
    motion=dict(enter="power4.out", move="power2.inOut", exit="power2.in", fast=0.3, base=0.6, slow=0.9, stagger=0.04,
                css_enter="cubic-bezier(0.25, 1, 0.5, 1)", css_move="cubic-bezier(0.45, 0, 0.55, 1)"),
    transitions=dict(grammar="B: one grammar (push between sections, rise inside)", speaker=["push", "wipe"], within="rise",
                     showcase="blinds into the end scene; no shader"),
    signature="statement",
    do=["Set the title as the image: one statement, 2-3 lines, flush left on the 12-column grid.",
        "Red marks ONE thing per scene (a word, a bar, a rule). Everything else is black, grey, white.",
        "Use thick rules and numbered sections (01, 02) as structure instead of boxes."],
    dont=["No rounded cards, no drop shadows, no gradients.",
          "Do not centre text blocks; the grid is the look.",
          "Do not shrink the title to fit more text: cut the text."],
)

# ---------------------------------------------------------------- 3. Terminal
PACKS["terminal"] = dict(
    label="Phosphor Terminal",
    pitch="Mono-forward, phosphor green on near-black, amber for warnings. Commands and their output tell the story.",
    prefers="dark", dial="balanced", fits=["security", "systems", "CLI / dev tools", "incident reports"],
    fonts=dict(
        display=face("IBM Plex Mono", "@fontsource/ibm-plex-mono", [400, 500, 600]),
        sans=face("IBM Plex Sans", "@fontsource/ibm-plex-sans", [400, 500, 600]),
        mono=face("IBM Plex Mono", "@fontsource/ibm-plex-mono", [400, 500, 600], role_note="covers Kazakh, so local-language commands are allowed"),
    ),
    label_font="mono",
    light={
        "canvas": "#F2F4EF", "surface": "#FBFCF9", "sunken": "#E6EAE2", "ink": "#0B140E", "ink-2": "#2D3B31", "muted": "#53635A",
        "line": "#D3DACF", "line-strong": "#8E9C90", "primary": "#0B7A45", "primary-soft": "#DDF2E6", "primary-ink": "#075C33",
        "on-primary": "#FFFFFF", "accent": "#935600", "accent-soft": "#F6E9D2", "on-accent": "#FFFFFF",
        "success": "#0B7A45", "warning": "#935600", "danger": "#B8282F", "highlight": "#C8F5D9",
        "hero": "#050806", "hero-ink": "#D8F5E1", "hero-muted": "#7FA88A", "hero-line": "#14201A", "hero-accent": "#5CFFA1",
        "mark": "#FF2D3D", "track": "rgb(11 20 14 / 0.14)", "scrim": "rgb(5 8 6 / 0.7)",
        "glow": "rgb(11 122 69 / 0.20)", "grid": "rgb(11 20 14 / 0.06)",
        "chart-1": "#0B7A45", "chart-2": "#935600", "chart-3": "#2D6FA8", "chart-4": "#8E9C90", "chart-5": "#B8282F",
    },
    dark={
        "canvas": "#0A0E0B", "surface": "#0F1511", "sunken": "#060807", "ink": "#D8F5E1", "ink-2": "#A9CDB4", "muted": "#74997E",
        "line": "#1A2620", "line-strong": "#2E4436", "primary": "#5CFFA1", "primary-soft": "#102A1C", "primary-ink": "#8DFFC0",
        "on-primary": "#03140A", "accent": "#FFC66B", "accent-soft": "#2A2110", "on-accent": "#1F1300",
        "success": "#5CFFA1", "warning": "#FFC66B", "danger": "#FF6B6B", "highlight": "#1D4A30",
        "mark": "#FF4655", "track": "rgb(216 245 225 / 0.14)", "scrim": "rgb(0 0 0 / 0.75)",
        "glow": "rgb(92 255 161 / 0.30)", "grid": "rgb(92 255 161 / 0.05)",
        "chart-1": "#5CFFA1", "chart-2": "#FFC66B", "chart-3": "#6CC4FF", "chart-4": "#3C5A46", "chart-5": "#FF6B6B",
    },
    hero_bg="radial-gradient(1000px 600px at 50% 40%, rgb(92 255 161 / 0.07), transparent 70%), var(--color-hero)",
    type=dict(display=(124, 1.02, "-0.03em", 600), h1=(68, 1.08, "-0.025em", 600), h2=(36, 1.2, "-0.01em", 600),
              stat=(150, 0.95, "-0.04em", 500), body_l=(30, 1.45), body_m=(24, 1.45), label=(18, "0.04em", "none")),
    radius=dict(card=10, chip=6, frame=12),
    shadow=dict(sm="0 1px 2px rgb(5 8 6 / 0.08), 0 6px 18px rgb(5 8 6 / 0.06)", lg="0 24px 70px rgb(5 8 6 / 0.25)",
                glow="0 0 0 1px rgb(11 122 69 / 0.3), 0 0 40px rgb(11 122 69 / 0.18)"),
    shadow_dark=dict(sm="0 0 0 1px rgb(92 255 161 / 0.06), 0 10px 30px rgb(0 0 0 / 0.5)", lg="0 30px 90px rgb(0 0 0 / 0.7)",
                     glow="0 0 0 1px rgb(92 255 161 / 0.35), 0 0 40px rgb(92 255 161 / 0.25)"),
    card=dict(bg="var(--color-surface)", border="1px solid var(--color-line)"),
    motion=dict(enter="power2.out", move="power2.inOut", exit="power1.in", fast=0.2, base=0.45, slow=0.8, stagger=0.03,
                css_enter="cubic-bezier(0.33, 1, 0.68, 1)", css_move="cubic-bezier(0.45, 0, 0.55, 1)"),
    transitions=dict(grammar="B: clear / new tab between scenes", speaker=["blinds", "pixels"], within="rise",
                     showcase="pixels (16×9 phosphor squares) at speaker changes"),
    signature="window",
    do=["Every scene is a command and its output: prompt line in mono, the result as a real UI block.",
        "Explain in IBM Plex Sans; mono only for commands, paths, numbers.",
        "Amber only for warnings and the one number that matters."],
    dont=["No green-on-black body paragraphs; prose goes on a card in sans.",
          "No fake 'hacker' rain or glitch on every step; one decode moment per talk at most.",
          "On a classroom projector, use the light 'paper terminal' palette for content scenes."],
)

# ---------------------------------------------------------------- 4. Paper research
PACKS["paper"] = dict(
    label="Paper Research",
    pitch="Warm paper, serif headlines, ink-blue links and oxblood annotations. A living document read aloud.",
    prefers="light", dial="academic", fits=["thesis defence", "research talk", "law / policy", "literature"],
    fonts=dict(
        display=face("Literata", "@fontsource/literata", [500, 600, 700]),
        sans=face("Source Sans 3", "@fontsource/source-sans-3", [400, 600]),
        mono=face("Source Code Pro", "@fontsource/source-code-pro", [500]),
    ),
    label_font="sans",
    light={
        "canvas": "#F6F2EA", "surface": "#FFFDF8", "sunken": "#EDE7DB", "ink": "#1E1B16", "ink-2": "#3F3930", "muted": "#665E52",
        "line": "#DDD5C6", "line-strong": "#A79D8B", "primary": "#1F4E79", "primary-soft": "#E3EBF3", "primary-ink": "#173B5C",
        "on-primary": "#FFFFFF", "accent": "#9C3B26", "accent-soft": "#F4E2DA", "on-accent": "#FFFFFF",
        "success": "#2D6B3C", "warning": "#8F6200", "danger": "#9C3B26", "highlight": "#F6E27A",
        "hero": "#ECE5D6", "hero-ink": "#1E1B16", "hero-muted": "#5B5347", "hero-line": "#D3C9B6", "hero-accent": "#9C3B26",
        "mark": "#D7263D", "track": "rgb(30 27 22 / 0.14)", "scrim": "rgb(30 27 22 / 0.6)",
        "glow": "rgb(246 226 122 / 0.6)", "grid": "rgb(30 27 22 / 0.06)",
        "chart-1": "#1F4E79", "chart-2": "#9C3B26", "chart-3": "#6E8B3D", "chart-4": "#B8A88A", "chart-5": "#5B5347",
    },
    dark=None,
    hero_bg="var(--color-hero)",
    type=dict(display=(120, 1.04, "-0.02em", 600), h1=(68, 1.1, "-0.015em", 600), h2=(38, 1.2, "-0.01em", 600),
              stat=(140, 0.95, "-0.02em", 500), body_l=(30, 1.5), body_m=(24, 1.5), label=(18, "0.12em", "uppercase")),
    radius=dict(card=6, chip=4, frame=6),
    shadow=dict(sm="0 1px 0 rgb(60 40 10 / 0.06), 0 10px 30px -14px rgb(60 40 10 / 0.22)", lg="0 24px 60px -20px rgb(60 40 10 / 0.30)", glow="none"),
    card=dict(bg="var(--color-surface)", border="1px solid var(--color-line)"),
    motion=dict(enter="power2.out", move="power2.inOut", exit="power1.in", fast=0.3, base=0.6, slow=0.9, stagger=0.06,
                css_enter="cubic-bezier(0.33, 1, 0.68, 1)", css_move="cubic-bezier(0.45, 0, 0.55, 1)"),
    transitions=dict(grammar="B: page scroll / rise", speaker=["rise", "push"], within="rise", showcase="not recommended"),
    signature="annotated",
    do=["Headlines in Literata as full sentences; body and labels in Source Sans 3.",
        "The hand is a highlighter: mark ONE phrase per step with --color-highlight, margin notes in oxblood.",
        "Cite the source on every data scene (footer `source`)."],
    dont=["No dark scenes, no glow, no glass; the hero is light paper too.",
          "No serif below 24 px (it thins out on projectors).",
          "No italic paragraphs; italic for one term at a time."],
)

# ---------------------------------------------------------------- 5. Aurora launch
PACKS["aurora"] = dict(
    label="Aurora Launch",
    pitch="Launch-night hero: a slow aurora over a deep ink sky, glass panels, big thin numbers. Northern light, not neon.",
    prefers="dark", dial="showcase", fits=["product launch", "demo day final", "startup pitch", "hackathon finals"],
    fonts=dict(
        display=face("Geologica", "@fontsource/geologica", [300, 600, 800]),
        sans=face("Geologica", "@fontsource/geologica", [400, 500]),
        mono=face("Geist Mono", "@fontsource/geist-mono", [400, 500], role_note="labels; no ₸ glyph"),
    ),
    label_font="mono",
    light={
        "canvas": "#F6F7FA", "surface": "#FFFFFF", "sunken": "#ECEEF4", "ink": "#0D0C18", "ink-2": "#36344A", "muted": "#615E77",
        "line": "#DEDDE8", "line-strong": "#A6A3B8", "primary": "#0A7C68", "primary-soft": "#DCF4EE", "primary-ink": "#075E4F",
        "on-primary": "#FFFFFF", "accent": "#B8471A", "accent-soft": "#FCE6DA", "on-accent": "#FFFFFF",
        "success": "#0A7C68", "warning": "#9A6700", "danger": "#C42B45", "highlight": "#C9F7EA",
        "hero": "#05040B", "hero-ink": "#F4F2FF", "hero-muted": "#A39DC2", "hero-line": "#1C1930", "hero-accent": "#6FE7C8",
        "mark": "#FF2D3D", "track": "rgb(13 12 24 / 0.14)", "scrim": "rgb(5 4 11 / 0.7)",
        "glow": "rgb(10 124 104 / 0.22)", "grid": "rgb(13 12 24 / 0.05)",
        "chart-1": "#0A7C68", "chart-2": "#3D63E0", "chart-3": "#7B5BD6", "chart-4": "#B8471A", "chart-5": "#A6A3B8",
    },
    dark={
        "canvas": "#07060D", "surface": "#110F1C", "sunken": "#04030A", "ink": "#F4F2FF", "ink-2": "#C9C4E3", "muted": "#958FB3",
        "line": "#221F33", "line-strong": "#3B3654", "primary": "#6FE7C8", "primary-soft": "#0E2A26", "primary-ink": "#A5F3DE",
        "on-primary": "#03140F", "accent": "#FF9E6B", "accent-soft": "#2E1A10", "on-accent": "#2A1000",
        "success": "#6FE7C8", "warning": "#F5C25A", "danger": "#FF6E8A", "highlight": "#173E36",
        "mark": "#FF4655", "track": "rgb(244 242 255 / 0.14)", "scrim": "rgb(0 0 0 / 0.72)",
        "glow": "rgb(111 231 200 / 0.35)", "grid": "rgb(255 255 255 / 0.04)",
        "chart-1": "#6FE7C8", "chart-2": "#6E9BFF", "chart-3": "#A98BFF", "chart-4": "#FF9E6B", "chart-5": "#4A4566",
    },
    hero_bg=("radial-gradient(900px 520px at 22% 18%, rgb(62 240 176 / 0.30), transparent 62%), "
             "radial-gradient(1000px 560px at 62% 6%, rgb(60 150 255 / 0.26), transparent 64%), "
             "radial-gradient(820px 520px at 92% 30%, rgb(155 123 255 / 0.24), transparent 62%), "
             "radial-gradient(1400px 420px at 50% 120%, rgb(255 158 107 / 0.16), transparent 70%), var(--color-hero)"),
    type=dict(display=(156, 0.96, "-0.045em", 800), h1=(80, 1.04, "-0.035em", 600), h2=(40, 1.18, "-0.02em", 600),
              stat=(184, 0.9, "-0.05em", 300), body_l=(30, 1.45), body_m=(24, 1.45), label=(18, "0.14em", "uppercase")),
    radius=dict(card=28, chip=999, frame=24),
    shadow=dict(sm="0 1px 2px rgb(13 12 24 / 0.05), 0 10px 30px rgb(13 12 24 / 0.07)", lg="0 30px 90px rgb(13 12 24 / 0.20)",
                glow="0 0 0 1px rgb(111 231 200 / 0.25), 0 0 60px rgb(111 231 200 / 0.25)"),
    shadow_dark=dict(sm="0 1px 0 rgb(255 255 255 / 0.06) inset, 0 12px 40px rgb(0 0 0 / 0.45)", lg="0 1px 0 rgb(255 255 255 / 0.08) inset, 0 40px 120px rgb(0 0 0 / 0.6)",
                     glow="0 0 0 1px rgb(111 231 200 / 0.35), 0 0 70px rgb(111 231 200 / 0.30)"),
    card=dict(bg="var(--color-surface)", border="1px solid var(--color-line)"),
    card_dark=dict(bg="linear-gradient(160deg, rgb(255 255 255 / 0.08), rgb(255 255 255 / 0.02)), rgb(17 15 28 / 0.72)", border="1px solid rgb(255 255 255 / 0.10)"),
    motion=dict(enter="expo.out", move="expo.inOut", exit="power3.in", fast=0.4, base=0.9, slow=1.4, stagger=0.07,
                css_enter="cubic-bezier(0.16, 1, 0.3, 1)", css_move="cubic-bezier(0.87, 0, 0.13, 1)"),
    transitions=dict(grammar="A: variety at speaker changes", speaker=["circle", "shape", "split", "zoom"], within="rise",
                     showcase="shader at 2-3 speaker changes, one throughZoom into the demo"),
    signature="glass",
    do=["The aurora lives on hero scenes and drifts slowly (20-40 s loop); content scenes get at most a faint wash.",
        "Glass only over the aurora, never over flat colour (it just looks grey).",
        "Big numbers in Geologica 300: thin and large reads premium; bold and large reads loud."],
    dont=["No gradient text on body copy; gradient fill only on ONE hero number or word.",
          "Under academic/balanced the aurora degrades to a static soft gradient on the hero only.",
          "No more than one glowing element per scene."],
)

# ---------------------------------------------------------------- 6. Brutalist data
PACKS["brutalist"] = dict(
    label="Raw Data",
    pitch="Concrete paper, black 3 px frames, hard offset shadows, acid highlights. Numbers are the architecture.",
    prefers="light", dial="balanced", fits=["data journalism", "hackathon", "student project with numbers", "manifesto"],
    fonts=dict(
        display=face("Tektur", "@fontsource/tektur", [600, 800]),
        sans=face("Golos Text", "@fontsource/golos-text", [400, 500, 600]),
        mono=face("Ubuntu Sans Mono", "@fontsource/ubuntu-sans-mono", [500, 700], role_note="all figures and labels"),
    ),
    label_font="mono",
    light={
        "canvas": "#EFEDE6", "surface": "#FFFFFF", "sunken": "#E2DFD5", "ink": "#0D0D0D", "ink-2": "#222222", "muted": "#4B4943",
        "line": "#0D0D0D", "line-strong": "#0D0D0D", "primary": "#0D0D0D", "primary-soft": "#E2DFD5", "primary-ink": "#0D0D0D",
        "on-primary": "#EFEDE6", "accent": "#E4FF3A", "accent-soft": "#F4FFB0", "on-accent": "#0D0D0D",
        "success": "#137A3A", "warning": "#8A6500", "danger": "#D11F1F", "highlight": "#E4FF3A",
        "hero": "#0D0D0D", "hero-ink": "#EFEDE6", "hero-muted": "#A9A69C", "hero-line": "#2A2A2A", "hero-accent": "#E4FF3A",
        "mark": "#FF2D3D", "track": "rgb(13 13 13 / 0.18)", "scrim": "rgb(13 13 13 / 0.7)",
        "glow": "rgb(228 255 58 / 0.6)", "grid": "rgb(13 13 13 / 0.08)",
        "chart-1": "#0D0D0D", "chart-2": "#E4FF3A", "chart-3": "#FF5A1F", "chart-4": "#7A776E", "chart-5": "#C8C4B8",
    },
    dark={
        "canvas": "#111111", "surface": "#1A1A1A", "sunken": "#0A0A0A", "ink": "#EFEDE6", "ink-2": "#D6D3CA", "muted": "#A9A69C",
        "line": "#EFEDE6", "line-strong": "#EFEDE6", "primary": "#EFEDE6", "primary-soft": "#2A2A2A", "primary-ink": "#EFEDE6",
        "on-primary": "#111111", "accent": "#E4FF3A", "accent-soft": "#3A4210", "on-accent": "#0D0D0D",
        "success": "#4CD07A", "warning": "#F0C040", "danger": "#FF5A5A", "highlight": "#E4FF3A",
        "mark": "#FF4655", "track": "rgb(239 237 230 / 0.2)", "scrim": "rgb(0 0 0 / 0.75)",
        "glow": "rgb(228 255 58 / 0.4)", "grid": "rgb(239 237 230 / 0.08)",
        "chart-1": "#EFEDE6", "chart-2": "#E4FF3A", "chart-3": "#FF7A45", "chart-4": "#7A776E", "chart-5": "#3A3A3A",
    },
    hero_bg="var(--color-hero)",
    type=dict(display=(160, 1.02, "-0.02em", 800), h1=(80, 1.04, "-0.02em", 800), h2=(40, 1.15, "-0.01em", 600),
              stat=(200, 0.88, "-0.04em", 700), body_l=(30, 1.4), body_m=(24, 1.4), label=(18, "0.04em", "uppercase")),
    radius=dict(card=0, chip=0, frame=0),
    shadow=dict(sm="8px 8px 0 var(--color-ink)", lg="14px 14px 0 var(--color-ink)", glow="0 0 0 6px var(--color-accent)"),
    card=dict(bg="var(--color-surface)", border="3px solid var(--color-ink)"),
    motion=dict(enter="power4.out", move="expo.inOut", exit="power3.in", fast=0.25, base=0.5, slow=0.8, stagger=0.03,
                css_enter="cubic-bezier(0.25, 1, 0.5, 1)", css_move="cubic-bezier(0.87, 0, 0.13, 1)"),
    transitions=dict(grammar="A: hard cuts and slabs", speaker=["curtain", "blinds", "wipe"], within="rise",
                     showcase="pixels in acid + black; no shader"),
    signature="statement",
    do=["Every number in Ubuntu Sans Mono 700, set huge; labels are mono caps.",
        "Acid yellow is a FILL behind black text (a highlight slab), never a text colour. Keep display line-height >= 1.0: Kazakh descenders (Ұ қ ң) must not hit the slab below.",
        "Tables are welcome here: thick header rule, mono figures, one acid row."],
    dont=["No rounded corners, no blur, no gradients, no glow.",
          "Do not mix in soft shadows; the shadow is a hard 8 px offset or nothing.",
          "Not for a calm academic jury unless the topic is the data itself."],
)

# ---------------------------------------------------------------- 7. Calm academic
PACKS["calm"] = dict(
    label="Calm Academic",
    pitch="Projector-safe and quiet: off-white, deep ink, one blue, generous type. Motion only where it explains.",
    prefers="light", dial="academic", fits=["course defence", "teacher / jury", "conference room projector", "lecture"],
    fonts=dict(
        display=face("Noto Sans", "@fontsource/noto-sans", [600, 700]),
        sans=face("Noto Sans", "@fontsource/noto-sans", [400, 500, 600]),
        mono=face("Noto Sans Mono", "@fontsource/noto-sans-mono", [500]),
    ),
    label_font="sans",
    light={
        "canvas": "#FBFBFA", "surface": "#FFFFFF", "sunken": "#F0F2F5", "ink": "#121722", "ink-2": "#2C3442", "muted": "#505968",
        "line": "#D6DAE0", "line-strong": "#8C95A3", "primary": "#1F4FBF", "primary-soft": "#E6EDFB", "primary-ink": "#173C93",
        "on-primary": "#FFFFFF", "accent": "#A84B05", "accent-soft": "#FBEBDC", "on-accent": "#FFFFFF",
        "success": "#1C7C46", "warning": "#8E6100", "danger": "#B42335", "highlight": "#FFE58A",
        "hero": "#EEF2F8", "hero-ink": "#121722", "hero-muted": "#465063", "hero-line": "#D3DBE7", "hero-accent": "#1F4FBF",
        "mark": "#E0182D", "track": "rgb(18 23 34 / 0.14)", "scrim": "rgb(18 23 34 / 0.6)",
        "glow": "rgb(31 79 191 / 0.15)", "grid": "rgb(18 23 34 / 0.05)",
        "chart-1": "#1F4FBF", "chart-2": "#A84B05", "chart-3": "#1C7C46", "chart-4": "#8C95A3", "chart-5": "#6B3FA0",
    },
    dark=None,
    hero_bg="var(--color-hero)",
    type=dict(display=(112, 1.05, "-0.025em", 700), h1=(64, 1.12, "-0.02em", 700), h2=(36, 1.2, "-0.01em", 600),
              stat=(128, 0.95, "-0.03em", 700), body_l=(32, 1.45), body_m=(26, 1.45), label=(20, "0.06em", "uppercase")),
    radius=dict(card=14, chip=999, frame=12),
    shadow=dict(sm="0 1px 2px rgb(18 23 34 / 0.05), 0 4px 14px rgb(18 23 34 / 0.05)", lg="0 16px 48px rgb(18 23 34 / 0.14)", glow="none"),
    card=dict(bg="var(--color-surface)", border="1px solid var(--color-line)"),
    motion=dict(enter="power2.out", move="power2.inOut", exit="power1.in", fast=0.3, base=0.55, slow=0.8, stagger=0.05,
                css_enter="cubic-bezier(0.33, 1, 0.68, 1)", css_move="cubic-bezier(0.45, 0, 0.55, 1)"),
    transitions=dict(grammar="B: one calm grammar (fade, rise, push)", speaker=["push"], within="rise", showcase="not recommended"),
    signature="annotated",
    do=["Body 26-32 px, labels 20 px; it must read from the back row of a washed-out projector.",
        "One idea per scene; shared-element moves (data-shared) to explain change.",
        "Blue for the subject, amber for the one thing to remember."],
    dont=["No dark scenes, including the cover.",
          "No mono for prose; Noto Sans Mono only for code.",
          "Do not lower contrast for 'elegance': muted text stays at least 4.5:1 after the projector simulation."],
)

# ---------------------------------------------------------------- 8. Kazakh ornament, modern
PACKS["oyu"] = dict(
    label="Oyu Modern",
    pitch="Contemporary Kazakh geometry: a ram's-horn (qoshqar müiz) rosette redrawn as a precise line module, on felt ivory and lapis night.",
    prefers="light", dial="balanced", fits=["Kazakhstan-rooted products", "culture / history", "city & public sector", "NU / local audience"],
    fonts=dict(
        display=face("Rubik", "@fontsource/rubik", [500, 600, 700]),
        sans=face("Nunito Sans", "@fontsource/nunito-sans", [400, 600, 700]),
        mono=face("IBM Plex Mono", "@fontsource/ibm-plex-mono", [500]),
    ),
    label_font="sans",
    light={
        "canvas": "#F5F0E6", "surface": "#FFFBF3", "sunken": "#EAE2D2", "ink": "#14202B", "ink-2": "#33414D", "muted": "#58616B",
        "line": "#DCD2BF", "line-strong": "#A39880", "primary": "#1E4E8C", "primary-soft": "#E2EAF4", "primary-ink": "#173D6E",
        "on-primary": "#FFFFFF", "accent": "#A8352A", "accent-soft": "#F4DFD9", "on-accent": "#FFFFFF",
        "success": "#2E6B3F", "warning": "#8C5E00", "danger": "#A8352A", "highlight": "#F2D98A",
        "hero": "#13202E", "hero-ink": "#F5F0E6", "hero-muted": "#A7B2BF", "hero-line": "#24344A", "hero-accent": "#E07A5F",
        "mark": "#E0182D", "track": "rgb(20 32 43 / 0.14)", "scrim": "rgb(19 32 46 / 0.66)",
        "glow": "rgb(224 122 95 / 0.25)", "grid": "rgb(20 32 43 / 0.06)",
        "chart-1": "#1E4E8C", "chart-2": "#A8352A", "chart-3": "#C08A2E", "chart-4": "#5E7F6E", "chart-5": "#A39880",
    },
    dark={
        "canvas": "#101A25", "surface": "#162231", "sunken": "#0B131C", "ink": "#F5F0E6", "ink-2": "#D3CCBE", "muted": "#9AA6B3",
        "line": "#24344A", "line-strong": "#3D5170", "primary": "#8DB4E8", "primary-soft": "#1B2D45", "primary-ink": "#B7D0F2",
        "on-primary": "#0B1626", "accent": "#E8836A", "accent-soft": "#3A1F1A", "on-accent": "#24100B",
        "success": "#6CC08A", "warning": "#E2B24E", "danger": "#F07A6A", "highlight": "#4A3D17",
        "mark": "#FF4655", "track": "rgb(245 240 230 / 0.14)", "scrim": "rgb(0 0 0 / 0.72)",
        "glow": "rgb(232 131 106 / 0.30)", "grid": "rgb(245 240 230 / 0.05)",
        "chart-1": "#8DB4E8", "chart-2": "#E8836A", "chart-3": "#E2B24E", "chart-4": "#6CC08A", "chart-5": "#3D5170",
    },
    hero_bg="radial-gradient(1200px 700px at 80% 20%, rgb(30 78 140 / 0.45), transparent 65%), var(--color-hero)",
    type=dict(display=(140, 1.0, "-0.03em", 700), h1=(76, 1.06, "-0.025em", 600), h2=(38, 1.18, "-0.01em", 600),
              stat=(160, 0.92, "-0.035em", 500), body_l=(30, 1.45), body_m=(24, 1.45), label=(18, "0.14em", "uppercase")),
    radius=dict(card=18, chip=999, frame=16),
    shadow=dict(sm="0 1px 2px rgb(20 32 43 / 0.05), 0 8px 24px rgb(20 32 43 / 0.07)", lg="0 24px 70px rgb(20 32 43 / 0.18)", glow="none"),
    card=dict(bg="var(--color-surface)", border="1px solid var(--color-line)"),
    motion=dict(enter="power3.out", move="power3.inOut", exit="power2.in", fast=0.35, base=0.7, slow=1.1, stagger=0.06,
                css_enter="cubic-bezier(0.22, 1, 0.36, 1)", css_move="cubic-bezier(0.65, 0, 0.35, 1)"),
    transitions=dict(grammar="B with an ornament wipe at speaker changes", speaker=["stroke", "curtain"], within="rise",
                     showcase="stroke wipe drawn along the ornament path"),
    signature="ornament",
    do=["The ornament is structure: a band along one edge, a divider, a corner mark, the progress line. Draw it with DrawSVG.",
        "One module (the four-horn rosette), line-only, one colour (madder on light, terracotta on lapis).",
        "Kazakh text everywhere it belongs: every face of this pack covers ә ғ қ ң ө ұ ү һ і."],
    dont=["No yurts, eagles, dombras, flag sky-blue + gold pairing or folk clip art as decoration.",
          "Never put ornament behind body text or data; at most 6 % opacity as a field, and only on hero scenes.",
          "Do not mix several traditional motifs in one deck; one module, used with precision."],
)

# ---------------------------------------------------------------- shared helpers

# The four-horn rosette: one ram's-horn pair (qoshqar müiz) = a stem with two curls that open outward and spiral
# back in, repeated at 90°. Line-only, round caps; colour comes from CSS (mask-image + background-color).
_HORN = ("M40 40V27M40 27C40 16 50 9 59 13C67 17 66 29 58 30C52 31 50.5 24 55 23"
         "M40 27C40 16 30 9 21 13C13 17 14 29 22 30C28 31 29.5 24 25 23")
ORNAMENT_TILE = (
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><g fill='none' stroke='black' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'>"
    f"<path d='{_HORN}'/><path d='{_HORN}' transform='rotate(90 40 40)'/><path d='{_HORN}' transform='rotate(180 40 40)'/><path d='{_HORN}' transform='rotate(270 40 40)'/>"
    "<path d='M40 34.5L45.5 40L40 45.5L34.5 40Z'/></g></svg>"
)
# The running border: horn pairs alternately up and down from one baseline (a classic oyu border, redrawn as a line module).
_UP = "M20 20V13C20 6 27 2 33 5C38 8 37 15 32 15.5C28.5 16 27.5 11.5 30.5 11M20 13C20 6 13 2 7 5C2 8 3 15 8 15.5C11.5 16 12.5 11.5 9.5 11"
BAND_TILE = (
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 40'><g fill='none' stroke='black' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'>"
    f"<path d='M0 20H80'/><path d='{_UP}'/><path d='{_UP}' transform='translate(40 0) rotate(180 20 20)'/></g></svg>"
)


def px(v):
    return f"{v}px"


def theme_css(name: str, p: dict) -> str:
    f = p["fonts"]
    lf = {"mono": "var(--font-mono)", "sans": "var(--font-sans)"}[p["label_font"]]
    t = p["type"]
    lines = [f"/* Style pack: {p['label']} ({name}). Generated by packs/_build.py — edit there.",
             f"   {p['pitch']}",
             f"   prefers: {p['prefers']} · recommended DECK.style: {p['dial']} */",
             "@custom-variant dark (&:where(.dark, .dark *));", "", "@theme static {"]
    lines += [f'  --font-display: "{f["display"]["family"]}", system-ui, sans-serif;',
              f'  --font-sans: "{f["sans"]["family"]}", system-ui, sans-serif;',
              f'  --font-mono: "{f["mono"]["family"]}", ui-monospace, monospace;',
              f"  --font-label: {lf};", ""]
    for k in COLOR_SLOTS:
        lines.append(f"  --color-{k}: {p['light'][k]};")
    lines.append("")

    def tline(key, spec):
        size, lh, tr, w = spec
        return [f"  --text-{key}: {px(size)};", f"  --text-{key}--line-height: {lh};", f"  --text-{key}--letter-spacing: {tr};", f"  --text-{key}--font-weight: {w};"]
    for key in ("display", "h1", "h2", "stat"):
        lines += tline(key, t[key])
    lines += [f"  --text-body-l: {px(t['body_l'][0])};", f"  --text-body-l--line-height: {t['body_l'][1]};",
              f"  --text-body-m: {px(t['body_m'][0])};", f"  --text-body-m--line-height: {t['body_m'][1]};",
              f"  --text-label: {px(t['label'][0])};", f"  --text-label--letter-spacing: {t['label'][1]};",
              f"  --label-case: {t['label'][2]};", ""]
    r = p["radius"]
    lines += [f"  --radius-card: {px(r['card'])};", f"  --radius-chip: {px(r['chip'])};", f"  --radius-frame: {px(r['frame'])};", ""]
    s = p["shadow"]
    lines += [f"  --shadow-sm: {s['sm']};", f"  --shadow-lg: {s['lg']};", f"  --shadow-glow: {s['glow']};", ""]
    c = p["card"]
    lines += [f"  --card-bg: {c['bg']};", f"  --card-border: {c['border']};", f"  --card-top-rule: {c.get('top_rule', '0 solid transparent')};",
              f"  --hero-bg: {p['hero_bg']};", ""]
    m = p["motion"]
    lines += [f"  --ease-standard: {m['css_enter']};", f"  --ease-enter: {m['css_enter']};", f"  --ease-move: {m['css_move']};",
              f"  --duration-fast: {m['fast']}s;", f"  --duration-base: {m['base']}s;", f"  --duration-slow: {m['slow']}s;", "}", ""]
    if p.get("dark"):
        # One dark token set for both uses: the T theme toggle (.dark on <html>) and every dark scene
        # (.scene.hero: cover/end from balanced up, content scenes in showcase; fx, diagram and data-viz read it).
        lines.append("/* dark tokens: the T toggle (.dark) AND every dark scene (.scene.hero) */")
        lines.append(".dark, .scene.hero {")
        for k in COLOR_SLOTS:
            if k.startswith("hero"):
                continue  # hero slots are the same in both looks
            lines.append(f"  --color-{k}: {p['dark'][k]};")
        sd = p.get("shadow_dark", s)
        lines += [f"  --shadow-sm: {sd['sm']};", f"  --shadow-lg: {sd['lg']};", f"  --shadow-glow: {sd['glow']};"]
        # re-declared so var() references resolve against the dark slots inside a hero scene
        cd = p.get("card_dark") or c
        lines += [f"  --card-bg: {cd['bg']};", f"  --card-border: {cd['border']};"]
        lines.append("}")
    return "\n".join(lines) + "\n"


COMMON_CSS = """/* Pack utilities. Generated by packs/_build.py. Plain CSS, gated by the dial: html[data-style] is set
   from DECK.style in main.tsx. A feature the dial does not allow degrades (never disappears). */

/* .pk-texture: the pack's hero texture layer. Put <div class="pk-texture" /> first inside a hero SceneRoot. */
.pk-texture { position: absolute; inset: 0; pointer-events: none; }
/* .pk-stat: the big number of a data scene */
.pk-stat { font-family: var(--font-display); font-size: var(--text-stat); line-height: var(--text-stat--line-height);
  letter-spacing: var(--text-stat--letter-spacing); font-weight: var(--text-stat--font-weight); font-variant-numeric: tabular-nums; }
/* .pk-rule: a divider in the pack's voice */
.pk-rule { height: 1px; background: var(--color-line); border: 0; }
/* .pk-frame: a window / device frame for UI, code, terminal output */
.pk-frame { position: relative; border-radius: var(--radius-frame); background: var(--color-surface); border: 1px solid var(--color-line);
  box-shadow: var(--shadow-lg); overflow: hidden; }
.pk-frame-bar { height: 48px; display: flex; align-items: center; gap: 10px; padding: 0 20px; border-bottom: 1px solid var(--color-line);
  font-family: var(--font-mono); font-size: 18px; color: var(--color-muted); }
.pk-frame-bar i { width: 12px; height: 12px; border-radius: 50%; background: var(--color-line-strong); display: block; }
/* .pk-glow: light as material, for ONE element per scene */
.pk-glow { box-shadow: var(--shadow-glow); }
html[data-style="academic"] .pk-glow { box-shadow: var(--shadow-sm); }
/* .pk-mark: highlighter behind a phrase (the hand of document concepts) */
.pk-mark { background: linear-gradient(transparent 58%, var(--color-highlight) 58% 92%, transparent 92%); padding: 0 0.08em; }
/* .pk-kicker: numbered section marker */
.pk-kicker { font-family: var(--font-label); font-size: var(--text-label); letter-spacing: var(--text-label--letter-spacing);
  text-transform: var(--label-case); color: var(--color-muted); }
.hero .pk-kicker { color: var(--color-hero-muted); }
"""

EXTRA_CSS = {
    "midnight": """
/* Midnight: a cool top light and a dot grid that fades out; hairline highlight on cards in dark. */
.pk-texture { background:
  radial-gradient(60% 50% at 70% 0%, rgb(157 178 255 / 0.10), transparent 70%),
  radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.07) 1px, transparent 1.5px) 0 0 / 32px 32px;
  -webkit-mask-image: radial-gradient(70% 70% at 60% 30%, #000 30%, transparent 80%); mask-image: radial-gradient(70% 70% at 60% 30%, #000 30%, transparent 80%); }
.pk-hairline { position: relative; }
.pk-hairline::before { content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; pointer-events: none;
  background: linear-gradient(180deg, rgb(255 255 255 / 0.22), rgb(255 255 255 / 0.02) 40%, rgb(157 178 255 / 0.18));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
html[data-style="academic"] .pk-texture { background: none; }
""",
    "swiss": """
/* Swiss: the 12-column grid made visible, thick rules, numbered sections. */
.pk-texture { background: repeating-linear-gradient(90deg, transparent 0 119px, var(--color-grid) 119px 120px); }
.hero .pk-texture { background: repeating-linear-gradient(90deg, transparent 0 119px, rgb(255 255 255 / 0.06) 119px 120px); }
.pk-rule { height: 3px; background: var(--color-ink); }
.hero .pk-rule { background: var(--color-hero-ink); }
.pk-index { font-family: var(--font-display); font-weight: 800; font-size: 28px; letter-spacing: -0.02em; color: var(--color-primary); }
.pk-frame { border-radius: 0; box-shadow: none; border: 3px solid var(--color-ink); }
""",
    "terminal": """
/* Terminal: faint scanlines and a phosphor bloom on hero scenes; a prompt glyph. */
.pk-texture { background: repeating-linear-gradient(0deg, rgb(255 255 255 / 0.025) 0 1px, transparent 1px 4px); }
.pk-prompt::before { content: "$ "; color: var(--color-primary); }
.hero .pk-prompt::before { color: var(--color-hero-accent); }
.pk-caret { display: inline-block; width: 0.55em; height: 1em; vertical-align: -0.12em; background: currentColor; animation: pk-blink 1.1s steps(1) infinite; }
@keyframes pk-blink { 50% { opacity: 0; } }
.pk-frame { background: var(--color-sunken); }
.dark .pk-frame, .hero .pk-frame { background: #050806; border-color: rgb(92 255 161 / 0.16); }
.dark .pk-frame-bar, .hero .pk-frame-bar { border-color: rgb(92 255 161 / 0.12); color: #7FA88A; }
.pk-frame-bar i:nth-child(1) { background: #FF6B6B; } .pk-frame-bar i:nth-child(2) { background: #FFC66B; } .pk-frame-bar i:nth-child(3) { background: #5CFFA1; }
html[data-style="academic"] .pk-texture { background: none; }
@media (prefers-reduced-motion: reduce) { .pk-caret { animation: none; } }
""",
    "paper": """
/* Paper: a page edge, a margin rule and real highlighter strokes. */
.pk-texture { background: linear-gradient(90deg, transparent 0 96px, rgb(156 59 38 / 0.22) 96px 97px, transparent 97px); }
.pk-margin { font-family: var(--font-sans); font-size: 22px; line-height: 1.35; color: var(--color-accent); font-style: italic; }
.pk-rule { height: 1px; background: var(--color-line-strong); }
.pk-cite { font-family: var(--font-sans); font-size: 18px; color: var(--color-muted); }
""",
    "aurora": """
/* Aurora: a slow drifting light field on hero scenes; glass over it. Degrades per the dial. */
.pk-texture { background:
  radial-gradient(40% 50% at 20% 20%, rgb(62 240 176 / 0.35), transparent 70%),
  radial-gradient(45% 55% at 60% 5%, rgb(60 150 255 / 0.30), transparent 70%),
  radial-gradient(40% 50% at 90% 30%, rgb(155 123 255 / 0.28), transparent 70%);
  filter: blur(30px); animation: pk-drift 36s ease-in-out infinite alternate; }
@keyframes pk-drift { from { transform: translate3d(-3%, 0, 0) scale(1.05); } to { transform: translate3d(3%, 2%, 0) scale(1.12); } }
.pk-glass { background: linear-gradient(160deg, rgb(255 255 255 / 0.12), rgb(255 255 255 / 0.03)); border: 1px solid rgb(255 255 255 / 0.14);
  backdrop-filter: blur(24px) saturate(1.3); -webkit-backdrop-filter: blur(24px) saturate(1.3); border-radius: var(--radius-card);
  box-shadow: 0 1px 0 rgb(255 255 255 / 0.12) inset, 0 30px 80px rgb(0 0 0 / 0.35); }
.pk-gradient-text { background: linear-gradient(100deg, #6FE7C8, #6E9BFF 55%, #A98BFF); -webkit-background-clip: text; background-clip: text; color: transparent; }
/* balanced: no drift, the field stays (soft aurora on hero allowed). academic: a static soft gradient, no glass. */
html[data-style="balanced"] .pk-texture { animation: none; }
html[data-style="academic"] .pk-texture { animation: none; filter: none; opacity: 0.35; }
html[data-style="academic"] .pk-glass { backdrop-filter: none; -webkit-backdrop-filter: none; background: var(--color-surface); border-color: var(--color-line); box-shadow: var(--shadow-sm); }
html[data-style="academic"] .pk-gradient-text { background: none; color: var(--color-primary); }
@media (prefers-reduced-motion: reduce) { .pk-texture { animation: none; } }
""",
    "brutalist": """
/* Raw Data: hard frames, acid slabs, a measuring grid. */
.pk-texture { background: linear-gradient(var(--color-grid) 1px, transparent 1px) 0 0 / 60px 60px, linear-gradient(90deg, var(--color-grid) 1px, transparent 1px) 0 0 / 60px 60px; }
.hero .pk-texture { background: linear-gradient(rgb(239 237 230 / 0.06) 1px, transparent 1px) 0 0 / 60px 60px, linear-gradient(90deg, rgb(239 237 230 / 0.06) 1px, transparent 1px) 0 0 / 60px 60px; }
.pk-slab { background: var(--color-accent); color: var(--color-on-accent); padding: 0 0.15em; box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.pk-stat { font-family: var(--font-mono); }
.pk-rule { height: 3px; background: var(--color-ink); }
.pk-frame { border-radius: 0; border: 3px solid var(--color-ink); box-shadow: var(--shadow-lg); }
.pk-frame-bar { border-bottom: 3px solid var(--color-ink); color: var(--color-ink); text-transform: uppercase; }
.pk-frame-bar i { border-radius: 0; background: var(--color-ink); }
""",
    "calm": """
/* Calm academic: no texture; a quiet rule and generous space. */
.pk-texture { display: none; }
.pk-rule { height: 2px; background: var(--color-line); }
""",
    "oyu": f"""
/* Oyu: the four-horn rosette (qoshqar müiz) as ONE line module. mask-image + background-color, so it takes any token. */
:root {{ --pk-ornament-svg: url("data:image/svg+xml,{ORNAMENT_TILE}"); --pk-band-svg: url("data:image/svg+xml,{BAND_TILE}"); }}
.pk-ornament, .pk-ornament-field, .hero .pk-texture {{ -webkit-mask-image: var(--pk-ornament-svg); mask-image: var(--pk-ornament-svg); }}
.pk-ornament-band {{ -webkit-mask-image: var(--pk-band-svg); mask-image: var(--pk-band-svg); }}
.pk-ornament {{ width: 80px; height: 80px; background: var(--color-accent); -webkit-mask-size: 100% 100%; mask-size: 100% 100%; }}
.hero .pk-ornament {{ background: var(--color-hero-accent); }}
.pk-ornament-band {{ height: 40px; background: var(--color-accent); -webkit-mask-size: 80px 40px; mask-size: 80px 40px; -webkit-mask-repeat: repeat-x; mask-repeat: repeat-x; }}
.hero .pk-ornament-band {{ background: var(--color-hero-accent); }}
/* the field: hero only, faint */
.hero .pk-texture {{ background: var(--color-hero-accent); opacity: 0.05; -webkit-mask-size: 120px 120px; mask-size: 120px 120px; }}
.pk-ornament-field {{ background: currentColor; opacity: 0.06; -webkit-mask-size: 120px 120px; mask-size: 120px 120px; }}
.pk-rule {{ height: 2px; background: linear-gradient(90deg, var(--color-accent) 0 64px, var(--color-line) 64px); }}
html[data-style="academic"] .hero .pk-texture {{ opacity: 0.04; }}
""",
}
def pack_json(name: str, p: dict) -> dict:
    return {
        "name": name, "label": p["label"], "pitch": p["pitch"], "prefers": p["prefers"],
        "dial": p["dial"], "darkTheme": bool(p.get("dark")), "fits": p["fits"],
        "signature": p["signature"],
        "motion": {k: p["motion"][k] for k in ("enter", "move", "exit", "fast", "base", "slow", "stagger")},
        "transitions": p["transitions"],
        "classes": sorted(set(c for c in __import__("re").findall(r"\.(pk-[a-z-]+)", COMMON_CSS + EXTRA_CSS.get(name, ""))) ),
        "do": p["do"], "dont": p["dont"],
    }


def fonts_json(p: dict, old: dict | None) -> dict:
    out = {"lang": "kk", "faces": {}, "rejected": REJECTED}
    for role, fc in p["fonts"].items():
        prev = (old or {}).get("faces", {}).get(role, {})
        merged = dict(fc)
        if prev.get("package") == fc["package"]:  # keep a previous coverage record (fonts.py record refreshes it)
            for k in ("version", "coverage"):
                if k in prev:
                    merged[k] = prev[k]
        out["faces"][role] = merged
    return out


# fonts checked with scripts/fonts.py (19 Nov 2026) and rejected for Kazakh; recorded so nobody re-tries them
REJECTED = [
    {"family": "JetBrains Mono", "why": "no Ғ ғ Қ қ Ң ң Ұ ұ (Kazakh)"},
    {"family": "Unbounded", "why": "no Ғ ғ Қ қ Ң ң Ү ү (Kazakh)"},
    {"family": "Manrope", "why": "no Ғ ғ Қ қ Ң ң Ұ ұ (Kazakh)"},
    {"family": "Martian Mono", "why": "no Ғ ғ Қ қ Ң ң Ү ү (Kazakh)"},
    {"family": "Playfair Display", "why": "no Ғ ғ Қ қ Ң ң Ү ү (Kazakh)"},
    {"family": "Wix Madefor Display / Text", "why": "no Ғ ғ Қ қ Ң ң Ү ү (Kazakh)"},
    {"family": "Jura", "why": "no Ғ ғ Қ қ Ң ң Ү ү (Kazakh)"},
    {"family": "Jost", "why": "no Kazakh letters, no №"},
    {"family": "Space Grotesk, Sora, DM Sans, Outfit, Lexend, Figtree, Albert Sans, Work Sans, Plus Jakarta Sans, Instrument Sans, Red Hat Display", "why": "no Cyrillic at all"},
    {"family": "Victor Mono", "why": "no №"},
]


def main() -> None:
    for name, p in PACKS.items():
        d = HERE / name
        d.mkdir(exist_ok=True)
        (d / "theme.css").write_text(theme_css(name, p), encoding="utf-8")
        (d / "pack.css").write_text(COMMON_CSS + EXTRA_CSS.get(name, ""), encoding="utf-8")
        (d / "pack.json").write_text(json.dumps(pack_json(name, p), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        old = json.loads((d / "fonts.json").read_text(encoding="utf-8")) if (d / "fonts.json").exists() else None
        (d / "fonts.json").write_text(json.dumps(fonts_json(p, old), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print("wrote", d)


if __name__ == "__main__":
    main()
