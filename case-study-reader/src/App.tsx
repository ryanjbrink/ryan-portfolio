import { useCallback, useEffect, useRef, useState } from "react";
import {
  CaseStudyReader,
  parseCaseStudyHtml,
  type CaseStudyData,
} from "./CaseStudyReader";

const DEMO_HTML = `<article class="case-study">
  <header class="case-hero">
    <img class="case-hero-media" src="https://placehold.co/2000x1200/0a0a0a/9ca3af?text=Hero" alt="Hero" />
    <h1 class="case-hero-title">Simple Variables</h1>
    <p class="case-hero-tagline">Variables built for designers — eliminating UX debt one token at a time.</p>
  </header>
  <section class="case-section">
    <h2>Problem</h2>
    <p>Legacy inconsistency across products meant designers had to reinvent the same primitives in every file.</p>
    <p>We needed a single source of truth that designers and engineers could trust.</p>
  </section>
  <section class="case-section">
    <h2>Outcome</h2>
    <p>Designers adopted the new variables without retraining, and we closed the gap with engineering in a single sprint.</p>
  </section>
</article>`;

export function App() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<"static" | "url">("static");
  const [data, setData] = useState<CaseStudyData>(() => parseCaseStudyHtml(DEMO_HTML));
  const abortRef = useRef<AbortController | null>(null);

  const loadFromUrl = useCallback(async (url: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const res = await fetch(url, { signal: ac.signal, credentials: "same-origin" });
      if (!res.ok) throw new Error(res.statusText || `HTTP ${res.status}`);
      const html = await res.text();
      if (ac.signal.aborted) return;
      setData(parseCaseStudyHtml(html));
    } catch (e) {
      if (ac.signal.aborted) return;
      setData({
        title: "Could not load case study",
        tagline: e instanceof Error ? e.message : "Failed to load",
        sections: [],
      });
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (source === "static") {
      setData(parseCaseStudyHtml(DEMO_HTML));
      setLoading(false);
      return;
    }
    const url = new URL("/simplevariables.html", window.location.origin).toString();
    void loadFromUrl(url);
  }, [source, loadFromUrl]);

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="mx-auto max-w-lg space-y-4 text-zinc-300">
        <h1 className="text-xl font-medium text-zinc-100">CaseStudyReader demo</h1>
        <p className="text-sm text-zinc-500">
          Run <code className="text-zinc-400">npm run dev</code>. “Fetch URL” loads{" "}
          <code className="text-zinc-400">/simplevariables.html</code> and{" "}
          <code className="text-zinc-400">/Images/*</code> from the parent repo via the Vite dev plugin.
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="src"
              checked={source === "static"}
              onChange={() => setSource("static")}
            />
            Static sample
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="src"
              checked={source === "url"}
              onChange={() => setSource("url")}
            />
            Fetch URL (dev)
          </label>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 transition duration-200 ease-out hover:bg-white"
        >
          Open reader
        </button>
      </div>

      <CaseStudyReader
        open={open}
        onClose={() => setOpen(false)}
        data={data}
        isLoading={loading}
      />
    </div>
  );
}
