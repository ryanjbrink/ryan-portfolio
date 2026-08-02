/**
 * Dedicated case study pages: parse the in-document article and mount
 * {@link CaseStudyReader} as a full-page reader.
 * Built with: vite build --config vite.embed.config.ts
 */
import { createRoot } from "react-dom/client";
import "./index.css";
import {
  CaseStudyReader,
  parseCaseStudyFromDocument,
} from "./CaseStudyReader";

function goHome() {
  window.location.href = "index.html";
}

function syncTheme() {
  const api = (window as Window & { SiteTheme?: { syncFromStorage: () => void } })
    .SiteTheme;
  if (api) {
    api.syncFromStorage();
    return;
  }
  try {
    const saved = localStorage.getItem("theme");
    const hour = new Date().getHours();
    const dark =
      saved === "dark" ||
      (saved !== "light" && (hour < 6 || hour >= 18));
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.classList.toggle("dark-mode", dark);
    document.body.classList.toggle("dark", dark);
    document.body.classList.toggle("dark-mode", dark);
  } catch {
    /* ignore */
  }
}

function boot() {
  syncTheme();
  const data = parseCaseStudyFromDocument(document);

  const source = document.querySelector<HTMLElement>("article.case-study");
  if (source) {
    source.querySelectorAll("video").forEach((video) => {
      video.pause();
      video.removeAttribute("autoplay");
      video.removeAttribute("src");
      video.load();
    });
    // Drop linear markup once parsed — avoids double content behind the reader.
    source.remove();
  }

  document.body.classList.add("case-study-reader-active");

  let rootEl = document.getElementById("case-study-root");
  if (!rootEl) {
    rootEl = document.createElement("div");
    rootEl.id = "case-study-root";
    document.body.appendChild(rootEl);
  }

  createRoot(rootEl).render(
    <CaseStudyReader
      open
      variant="page"
      data={data}
      onClose={goHome}
    />
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
