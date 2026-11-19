#!/usr/bin/env bash
# Zips skill/ as an uploadable Claude skill: animated-web-deck/SKILL.md + assets/, without installs or builds.
#   scripts/zip-skill.sh [out.zip]      default: sahna-skill.zip
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$(cd "$(dirname "${1:-sahna-skill.zip}")" && pwd)/$(basename "${1:-sahna-skill.zip}")"
name="animated-web-deck"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cp -r "$root/skill" "$work/$name"
rm -f "$out"
(cd "$work" && zip -qr "$out" "$name" \
  -x "*/node_modules/*" "*/dist/*" "*/dist-single/*" "*/.vite/*" "*/__pycache__/*" "*.pyc" "*.tsbuildinfo" \
     "*/report/*" "*/recordings/*" "*/.run/*" "*/config.local.json" "*/.venv/*" "*/.DS_Store")
if unzip -l "$out" | grep -qiE "node_modules|/gsap/|dist-single"; then echo "zip contains build or npm files" >&2; exit 1; fi
ls -l "$out"
