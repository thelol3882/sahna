# Third-party software and data

sahna's own code is MIT. The components below keep their own licenses.

## Included in this repository

- **@clack/prompts 1.9.0, @clack/core 1.6.0, sisteransi, fast-wrap-ansi, fast-string-width,
  fast-string-truncated-width**: MIT. Bundled in `skill/assets/cli/vendor/clack.mjs`;
  full notices in `skill/assets/cli/vendor/LICENSES.md`.
- **Natural Earth** admin-1 boundaries (1:10m): public domain. Raw data in
  `skill/assets/modules/data-viz/geo/`, derived SVG paths in `src/data-viz/maps/kz.map.json`.
  Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com.

## Installed from npm (not included; listed because built decks bundle them)

- **GSAP 3** and **@gsap/react**: GSAP Standard "No Charge" License,
  https://gsap.com/standard-license. Copyright GreenSock / Webflow. NOT covered by sahna's MIT license.
  It is never committed here: `npm install` fetches it, and builds keep its license banners.
- **React, React DOM**: MIT. **three.js**: MIT. **lucide-react**: ISC (Feather-derived icons MIT).
- **simple-icons**: CC0-1.0 for the package. Logos are trademarks of their owners, used only to
  identify the technologies shown in example diagrams; no endorsement implied. Icons whose entry
  carries its own license (Android, Apache Kafka, OpenTelemetry) and the Apple logo are not in the
  default registry.
- **Fonts (Fontsource)**: SIL Open Font License 1.1: Geist, Geist Mono, Inter, Inter Tight,
  Geologica, Golos Text, IBM Plex Sans, IBM Plex Mono, Literata, Noto Sans, Noto Sans Mono,
  Nunito Sans, Onest, Rubik, Source Code Pro, Source Sans 3, Tektur.
  Ubuntu Font Licence 1.0: Ubuntu Sans Mono. Fonts are used unmodified.

## Build-time tools only (not shipped in any output)

Vite, Rolldown, Tailwind CSS, vite-plugin-singlefile, Shiki, d3-geo: MIT/ISC. TypeScript: Apache-2.0.
elkjs: EPL-2.0 OR GPL-3.0-or-later (runs in Node to compute layouts; no ELK code is bundled).

## Python tools the scripts import (install separately; not included)

Playwright (Apache-2.0), python-pptx (MIT), Pillow (MIT-CMU), fonttools (MIT), brotli (MIT),
numpy (BSD-3-Clause), img2pdf (LGPL-3.0).
