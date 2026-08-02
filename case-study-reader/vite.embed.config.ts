import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(__dirname, "../js");

export default defineConfig({
  plugins: [react()],
  /**
   * Vite's IIFE `lib` build does NOT replace `process.env.NODE_ENV` by default,
   * which makes React throw `process is not defined` in the browser. Inline it.
   */
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "{}",
  },
  build: {
    outDir: out,
    // Keep sibling assets in ../js (e.g. current-role.js) when rebuilding the embed.
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "src/page-embed.tsx"),
      name: "CaseStudyPage",
      fileName: () => "case-study-page",
      formats: ["iife"],
    },
    rollupOptions: {
      output: {
        entryFileNames: "case-study-page.js",
        assetFileNames: (info) => {
          if (info.name && /\.css$/.test(info.name)) {
            return "case-study-page[extname]";
          }
          return "[name][extname]";
        },
      },
    },
  },
});
