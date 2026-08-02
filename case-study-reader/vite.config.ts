import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function mimeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  const m: Record<string, string> = {
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
  };
  return m[ext] ?? "application/octet-stream";
}

/** In dev, serve the parent portfolio case-study page and `Images/` so fetch + &lt;img&gt; work. */
function serveParentPortfolio(): Plugin {
  return {
    name: "serve-parent-portfolio",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url?.split("?")[0] ?? "";
        if (raw === "/simplevariables.html" || raw === "/simplevariables.html/") {
          const p = path.join(repoRoot, "simplevariables.html");
          if (fs.existsSync(p)) {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(fs.readFileSync(p));
            return;
          }
        }
        if (raw.startsWith("/Images/")) {
          const imagesRoot = path.join(repoRoot, "Images");
          const rel = decodeURIComponent(raw.slice("/Images/".length));
          if (rel.includes("..")) {
            next();
            return;
          }
          const full = path.resolve(imagesRoot, rel);
          if (!full.startsWith(imagesRoot)) {
            next();
            return;
          }
          if (fs.existsSync(full) && fs.statSync(full).isFile()) {
            res.setHeader("Content-Type", mimeFor(full));
            res.end(fs.readFileSync(full));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), serveParentPortfolio()],
});
