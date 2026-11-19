#!/usr/bin/env bash
# Builds the demo site: the showreel and the world example deck, each as one offline HTML file, plus an index.
#   scripts/build-pages.sh [out-dir]      default out-dir: _site
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$(mkdir -p "${1:-$root/_site}" && cd "${1:-$root/_site}" && pwd)"
assets="$root/skill/assets"

# 1. the showreel: the starter with every module except world
(cd "$assets/showreel" && npm ci --no-audit --no-fund && npm run build:single)
cp "$assets/showreel/dist-single/index.html" "$out/showreel.html"
cp "$assets/showreel/dist-single/.vite/license.md" "$out/showreel-licenses.md"

# 2. the world example: a new deck with the world module, then the example's scenes and data
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
node "$assets/cli/bin/sahna.js" new "$work/world" --modules world --title "Tessera" --no-install --json > /dev/null
rm -rf "$work/world/src/scenes"
cp -r "$assets/modules/world/example/scenes" "$work/world/src/scenes"
cp "$assets/modules/world/example/data.ts" "$work/world/src/data.ts"
(cd "$work/world" && npm install --no-audit --no-fund && npm run build:single)
cp "$work/world/dist-single/index.html" "$out/world.html"
cp "$work/world/dist-single/.vite/license.md" "$out/world-licenses.md"

cp "$root/docs/site/index.html" "$out/index.html"
ls -l "$out"
