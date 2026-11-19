#!/usr/bin/env node
// `npx sahna` / `npm run sahna -- <cmd>` in a deck project: runs the sahna CLI (`npx deck` still works too).
// It lives in sahna-cli/ (copied by `sahna new`); a starter copied by hand finds it through .sahna.json or SAHNA_ASSETS.
// Projects made by the older `deck` CLI have deck-cli/, .deck.json and DECK_ASSETS: those are still found.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inAssets = (assets) => [join(resolve(root, assets), "cli", "bin", "sahna.js"), join(resolve(root, assets), "cli", "bin", "deck.js")];
const tries = [join(root, "sahna-cli", "bin", "sahna.js"), join(root, "deck-cli", "bin", "deck.js")];
for (const meta of [".sahna.json", ".deck.json"]) {
  try {
    const assets = JSON.parse(readFileSync(join(root, meta), "utf8")).assets;
    if (assets) tries.push(...inAssets(assets));
    break;
  } catch {}
}
const envAssets = process.env.SAHNA_ASSETS || process.env.DECK_ASSETS;
if (envAssets) tries.push(...inAssets(envAssets));
const entry = tries.find((f) => existsSync(f));
if (entry) {
  await import(pathToFileURL(entry).href);
} else {
  console.error("The sahna CLI is not in this project (no sahna-cli/ folder).");
  console.error("Fix: copy <skill>/assets/cli to sahna-cli/ here, or set SAHNA_ASSETS=<skill>/assets, or create decks with: node <skill>/assets/cli/bin/sahna.js new <dir>");
  process.exitCode = 2;
}
