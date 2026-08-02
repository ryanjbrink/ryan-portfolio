/**
 * Legacy overlay host (unused in production).
 * Case studies are dedicated pages via {@link ./page-embed.tsx}.
 * Kept for local App.tsx / overlay demos only.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import {
  CaseStudyReader,
  parseCaseStudyHtml,
  type CaseStudyData,
} from "./CaseStudyReader";

const empty: CaseStudyData = {
  title: "",
  tagline: "",
  sections: [],
};

const cache = new Map<string, CaseStudyData>();
const pending = new Map<string, Promise<CaseStudyData>>();

function normalizeHref(href: string) {
  return href.split("#")[0] ?? href;
}

async function loadCaseStudy(
  href: string,
  signal?: AbortSignal
): Promise<CaseStudyData> {
  const key = normalizeHref(href);
  const cached = cache.get(key);
  if (cached) return cached;

  let inflight = pending.get(key);
  if (!inflight) {
    inflight = (async () => {
      const res = await fetch(key, {
        credentials: "same-origin",
        signal,
      });
      if (!res.ok) {
        throw new Error(res.statusText || `HTTP ${res.status}`);
      }
      const html = await res.text();
      const data = parseCaseStudyHtml(html);
      cache.set(key, data);
      pending.delete(key);
      return data;
    })().catch((err) => {
      pending.delete(key);
      throw err;
    });
    pending.set(key, inflight);
  }

  return inflight;
}

function prefetchCaseStudy(href: string) {
  const key = normalizeHref(href);
  if (cache.has(key) || pending.has(key)) return;
  void loadCaseStudy(key).catch(() => {});
}

function prefetchAllCaseStudies() {
  const hrefs = [
    ...document.querySelectorAll<HTMLAnchorElement>("a.cell--project[href]"),
  ]
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => Boolean(href?.endsWith(".html")));

  hrefs.forEach((href, index) => {
    window.setTimeout(() => prefetchCaseStudy(href), index * 50);
  });
}

function PortfolioCaseStudyHost() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CaseStudyData>(empty);
  const abortRef = useRef<AbortController | null>(null);

  const onClose = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setOpen(false);
    setLoading(false);
  }, []);

  const openCaseStudy = useCallback(
    async (href: string, labelTitle: string, fallbackHeroSrc?: string) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const path = normalizeHref(href);
      const cached = cache.get(path);

      setOpen(true);

      if (cached) {
        setData(cached);
        setLoading(false);
        return;
      }

      setData({
        title: labelTitle || "Case study",
        tagline: "",
        hero: fallbackHeroSrc
          ? { kind: "image", src: fallbackHeroSrc, alt: labelTitle }
          : undefined,
        sections: [],
      });
      setLoading(true);

      try {
        const parsed = await loadCaseStudy(path, ac.signal);
        if (ac.signal.aborted) return;
        setData(parsed);
      } catch (e) {
        if (ac.signal.aborted) return;
        setData({
          title: "Could not open case study",
          tagline:
            e instanceof Error
              ? e.message
              : "Something went wrong. Try the full page link if this persists.",
          sections: [],
        });
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const warm = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return;
      const a = target.closest("a.cell--project");
      if (!(a instanceof HTMLAnchorElement)) return;
      const href = a.getAttribute("href");
      if (href?.endsWith(".html")) prefetchCaseStudy(href);
    };

    const onPointerEnter = (e: PointerEvent) => warm(e.target);
    const onFocusIn = (e: FocusEvent) => warm(e.target);

    const onClick = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const a = t.closest("a.cell--project");
      if (!(a instanceof HTMLAnchorElement)) return;
      if (!a.href) return;

      const href = a.getAttribute("href");
      if (!href || !/\.html$/i.test(href)) return;
      if (/^https?:/i.test(href)) {
        try {
          const u = new URL(href);
          if (u.origin !== window.location.origin) return;
        } catch {
          return;
        }
      }

      e.preventDefault();
      const img = a.querySelector(".project-media-img, .hero-image");
      const label = img?.getAttribute("alt")?.trim() || "";
      const fallbackHero =
        a.dataset.heroPoster ?? img?.getAttribute("src") ?? undefined;
      void openCaseStudy(href, label, fallbackHero);
    };

    prefetchAllCaseStudies();

    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerenter", onPointerEnter, true);
    document.addEventListener("focusin", onFocusIn, true);

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerenter", onPointerEnter, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [openCaseStudy]);

  return (
    <CaseStudyReader
      open={open}
      onClose={onClose}
      data={data}
      isLoading={loading}
      anchorSelector=".home"
    />
  );
}

const el = document.getElementById("case-study-overlay-root");
if (el) {
  createRoot(el).render(<PortfolioCaseStudyHost />);
}
