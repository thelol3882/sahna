import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// `vite build --mode single` → dist-single/index.html: fonts and code inlined, works from file:// offline.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === "single" ? [viteSingleFile()] : [])],
  base: "./",
  build: {
    outDir: mode === "single" ? "dist-single" : "dist",
    // keep third-party license banners (GSAP, React, lucide) and write .vite/license.md next to the build
    license: true,
    rolldownOptions: { output: { comments: { legal: true } } },
    ...(mode === "single" ? { assetsInlineLimit: 100_000_000, cssCodeSplit: false } : {}),
  },
}));
