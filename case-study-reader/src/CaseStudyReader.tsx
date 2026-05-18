import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/* ────────────────────────────────────────────────────────────────────────── *
 * CaseStudyReader — glassmorphic popover/modal with slide navigation.
 *
 * • Slide 0 = overview (title + summary)
 * • Slides 1..N = each parsed section (heading, image(s), body, bullets)
 * • Prev / Next buttons + ← → arrow keys + slide counter in footer
 * • Close on backdrop click, Esc, or the X button
 * • Fade + scale entrance/exit, slide cross-fade on nav
 * ────────────────────────────────────────────────────────────────────────── */

export type CaseStudyImage = { src: string; alt: string };

export type CaseStudySection = {
  heading?: string;
  content?: ReactNode;
  items?: string[];
  images?: CaseStudyImage[];
};

export type CaseStudyReaderProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  summary: string;
  sections?: CaseStudySection[];
  /** Appears on the overview slide after the summary (optional). */
  overviewExtras?: ReactNode;
  children?: ReactNode;
  /** Label in the sticky header (defaults to `title`). */
  stickyTitle?: string;
  isLoading?: boolean;
  className?: string;
};

const DURATION_MS = 280;

/** Prefer `data-state="open|closed"` (strings) over `data-open={bool}` —
 *  React drops attributes whose value is literally `false`. */
const PANEL = [
  "relative flex flex-col overflow-hidden",
  "w-full max-w-[min(100%-1.5rem,45rem)] h-[min(90vh,880px)]",
  "rounded-[26px] border border-white/[0.12] ring-1 ring-inset ring-white/10",
  "bg-white/[0.07] backdrop-blur-2xl backdrop-saturate-150",
  "shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_25px_50px_-12px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.08)]",
  "origin-center transition duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
  "data-[state=closed]:opacity-0 data-[state=closed]:scale-[0.97] data-[state=closed]:translate-y-1",
  "data-[state=open]:opacity-100 data-[state=open]:scale-100 data-[state=open]:translate-y-0",
].join(" ");

const BACKDROP = [
  "absolute inset-0 cursor-default bg-zinc-950/55 backdrop-blur-sm",
  "transition duration-[240ms] ease-out",
  "data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
].join(" ");

function lockBody(locked: boolean) {
  if (typeof document === "undefined") return;
  if (locked) document.body.style.overflow = "hidden";
  else document.body.style.removeProperty("overflow");
}

/** Keeps the overlay mounted while the exit animation plays. */
function usePresence(visible: boolean) {
  const [mounted, setMounted] = useState(visible);
  useLayoutEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), DURATION_MS);
    return () => clearTimeout(t);
  }, [visible]);
  return mounted;
}

export function CaseStudyReader({
  open,
  onClose,
  title,
  summary,
  sections = [],
  overviewExtras,
  children,
  stickyTitle,
  isLoading = false,
  className = "",
}: CaseStudyReaderProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const descId = `${id}-summary`;
  const mounted = usePresence(open);
  /** Two rAFs after mount so the first paint is `closed`; entrance transitions. */
  const [entered, setEntered] = useState(false);

  /** Slides: overview + one per section. Overview is skipped when there's no
   *  hero summary (i.e., the source HTML omitted `.case-hero-subtitle` /
   *  `.case-meta`), so the reader opens directly on the first section. If
   *  there are also no sections, the overview is kept as a fallback. */
  const slides = useMemo(() => {
    const arr: Array<{ kind: "overview" } | { kind: "section"; section: CaseStudySection }> = [];
    const hasOverviewContent = Boolean(summary) || Boolean(overviewExtras) || Boolean(children);
    if (hasOverviewContent || sections.length === 0) {
      arr.push({ kind: "overview" });
    }
    for (const s of sections) arr.push({ kind: "section", section: s });
    return arr;
  }, [sections, summary, overviewExtras, children]);

  const [index, setIndex] = useState(0);
  /** Simple cross-fade between slides. */
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");

  const last = slides.length - 1;
  const atStart = index <= 0;
  const atEnd = index >= last;

  const goTo = useCallback(
    (next: number) => {
      setIndex((cur) => {
        const clamped = Math.max(0, Math.min(slides.length - 1, next));
        if (clamped === cur) return cur;
        setPhase("out");
        window.setTimeout(() => {
          setIndex(clamped);
          setPhase("in");
          window.setTimeout(() => setPhase("idle"), 180);
        }, 140);
        return cur;
      });
    },
    [slides.length]
  );

  const goNext = useCallback(() => goTo(index + 1), [goTo, index]);
  const goPrev = useCallback(() => goTo(index - 1), [goTo, index]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    },
    [onClose, goNext, goPrev]
  );

  useLayoutEffect(() => {
    if (!open) {
      setEntered(false);
      setIndex(0);
      setPhase("idle");
      return;
    }
    if (!mounted) return;
    setEntered(false);
    let a = 0;
    let b = 0;
    a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [open, mounted]);

  useEffect(() => {
    if (!mounted) return;
    lockBody(true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      lockBody(false);
    };
  }, [mounted, onKeyDown]);

  if (typeof document === "undefined" || !mounted) return null;
  const state = open && entered ? "open" : "closed";
  const slide = slides[index];

  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close case study"
        className={BACKDROP}
        data-state={state}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        aria-describedby={descId}
        {...(isLoading ? { "aria-busy": true as const } : {})}
        data-state={state}
        className={`${PANEL} z-[101] ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glass flourishes */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]"
        >
          <div className="absolute -inset-px bg-gradient-to-br from-white/[0.14] via-transparent to-white/[0.04] opacity-80" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(255,255,255,0.12),transparent)]" />
          <div
            className="absolute -left-1/2 top-0 h-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-30"
            style={{
              maskImage:
                "linear-gradient(90deg, transparent, white 20%, white 80%, transparent)",
              animation: "case-study-shimmer 4s ease-in-out infinite",
            }}
          />
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* Sticky header */}
          <header className="sticky top-0 z-20 shrink-0 border-b border-white/[0.08] bg-white/[0.04] px-6 pb-3 pt-4 backdrop-blur-md">
            <div className="flex items-center justify-between gap-3">
              <h2
                id={labelId}
                className="line-clamp-1 min-w-0 text-left text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-400"
              >
                {stickyTitle ?? title}
              </h2>
              <div className="flex items-center gap-2">
                {slides.length > 1 && !isLoading ? (
                  <span
                    className="tabular-nums text-[11px] font-medium text-zinc-500"
                    aria-label={`Slide ${index + 1} of ${slides.length}`}
                  >
                    {index + 1} / {slides.length}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="group -m-1 shrink-0 rounded-full p-2 text-zinc-500 transition duration-200 ease-out hover:bg-white/10 hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  aria-label="Close"
                >
                  <svg
                    className="h-4 w-4 transition duration-200 group-hover:scale-105"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
          </header>

          {/* Slide viewport */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth">
            <div
              key={index}
              data-phase={phase}
              className={[
                "px-6 pt-6 pb-24 transition duration-200 ease-out",
                "data-[phase=out]:opacity-0 data-[phase=out]:translate-x-2",
                "data-[phase=in]:opacity-100 data-[phase=in]:translate-x-0",
                "data-[phase=idle]:opacity-100 data-[phase=idle]:translate-x-0",
              ].join(" ")}
            >
              {isLoading ? (
                <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 py-10">
                  <div
                    className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-zinc-200"
                    role="status"
                    aria-label="Loading"
                  />
                  <p className="text-sm text-zinc-500">Loading case study…</p>
                </div>
              ) : slide?.kind === "overview" ? (
                <div className="space-y-6">
                  <div>
                    <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-zinc-50 sm:text-[32px]">
                      {title}
                    </h1>
                    {summary ? (
                      <p
                        id={descId}
                        className="mt-4 max-w-2xl text-[15px] leading-relaxed text-zinc-300"
                      >
                        {summary}
                      </p>
                    ) : (
                      <p id={descId} className="sr-only">
                        Case study
                      </p>
                    )}
                  </div>
                  {overviewExtras ? <div>{overviewExtras}</div> : null}
                  {children ? (
                    <div className="text-[15px] leading-[1.65] text-zinc-300 [&_a]:text-sky-400 [&_a]:underline-offset-2 hover:[&_a]:text-sky-300">
                      {children}
                    </div>
                  ) : null}
                </div>
              ) : slide?.kind === "section" ? (
                <SectionSlide section={slide.section} />
              ) : null}
            </div>
          </div>

          {/* Footer nav */}
          {slides.length > 1 && !isLoading ? (
            <footer className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.08] bg-white/[0.04] px-4 py-3 backdrop-blur-md">
              <NavButton
                onClick={goPrev}
                disabled={atStart}
                direction="prev"
                label="Previous slide"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Prev</span>
              </NavButton>

              <Dots total={slides.length} active={index} onGo={goTo} />

              <NavButton
                onClick={goNext}
                disabled={atEnd}
                direction="next"
                label="Next slide"
              >
                <span>Next</span>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </NavButton>
            </footer>
          ) : null}
        </div>

        <style>{`
          @keyframes case-study-shimmer {
            0%   { transform: translateX(-120%) skewX(-12deg); }
            100% { transform: translateX(120%) skewX(-12deg); }
          }
        `}</style>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

/* ─── subcomponents ───────────────────────────────────────────────────────── */

function SectionSlide({ section }: { section: CaseStudySection }) {
  const { heading, images, content, items } = section;
  return (
    <div className="space-y-5">
      {heading ? (
        <h3 className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-50">
          {heading}
        </h3>
      ) : null}

      {images && images.length > 0 ? (
        <div className="space-y-3">
          {images.map((im) => (
            <figure
              key={`${im.src}-${im.alt}`}
              className="overflow-hidden rounded-2xl border border-white/10 bg-black/25"
            >
              <img
                src={im.src}
                alt={im.alt}
                loading="lazy"
                className="h-auto w-full object-contain"
              />
            </figure>
          ))}
        </div>
      ) : null}

      {content ? (
        <div className="text-[15px] leading-[1.65] text-zinc-300 [&_a]:text-sky-400 [&_a]:underline-offset-2 hover:[&_a]:text-sky-300 [&_p+p]:mt-3">
          {content}
        </div>
      ) : null}

      {items && items.length > 0 ? (
        <ul className="list-disc space-y-2 pl-5 text-[15px] leading-[1.65] text-zinc-300 marker:text-zinc-600">
          {items.map((it, idx) => (
            <li key={`${it.slice(0, 24)}-${idx}`}>{it}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function NavButton({
  onClick,
  disabled,
  direction,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  direction: "prev" | "next";
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium",
        "border border-white/[0.08] bg-white/[0.06] text-zinc-200",
        "transition duration-200 ease-out",
        "hover:bg-white/[0.12] hover:text-white",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/[0.06] disabled:hover:text-zinc-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
        direction === "prev" ? "pl-2.5" : "pr-2.5",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Dots({
  total,
  active,
  onGo,
}: {
  total: number;
  active: number;
  onGo: (i: number) => void;
}) {
  /** Cap dots so a long case study doesn't overflow the footer. */
  const max = 9;
  const window = total <= max ? total : max;
  const half = Math.floor(window / 2);
  let start = Math.max(0, active - half);
  let end = Math.min(total, start + window);
  start = Math.max(0, end - window);
  const indices = Array.from({ length: end - start }, (_, i) => start + i);

  return (
    <div className="hidden items-center gap-1.5 sm:flex" aria-hidden>
      {indices.map((i) => (
        <button
          key={i}
          type="button"
          onClick={() => onGo(i)}
          tabIndex={-1}
          className={[
            "h-1.5 rounded-full transition-all duration-200 ease-out",
            i === active
              ? "w-5 bg-zinc-200"
              : "w-1.5 bg-white/20 hover:bg-white/40",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

/* ─── HTML → sections helpers ─────────────────────────────────────────────── */

function text(el: Element | null | undefined) {
  return el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

/** Parse HTML string into `{ title, summary, sections }`. Handles both the
 *  `.case-card` pattern (Simple Variables) and the inline `.case-section`
 *  pattern (Landstar, Phoney, Ford Scan). */
export function parseCaseStudyHtml(html: string) {
  if (typeof DOMParser === "undefined") {
    return { title: "Case study", summary: "", sections: [] };
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  return parseCaseStudyFromDocument(doc);
}

export function parseCaseStudyFromDocument(doc: Document) {
  const h1 = doc.querySelector<HTMLElement>(
    "h1.case-hero-title, .case-hero-title, article h1, h1"
  );
  const title = text(h1) || "Case study";

  const sub = text(doc.querySelector(".case-hero-subtitle"));
  const meta = doc.querySelector(".case-meta");
  const metaBits = meta
    ? Array.from(meta.querySelectorAll("span"))
        .map((s) => text(s))
        .filter(Boolean)
    : [];
  const summary =
    [sub, metaBits.join(" · ")].filter(Boolean).join(" — ") || sub;

  const sections: CaseStudySection[] = [];

  /** Pattern A: `.case-card` (Simple Variables) — card holds media + body. */
  const cards = Array.from(doc.querySelectorAll<HTMLElement>(".case-card"));
  for (const card of cards) {
    const body = card.querySelector(".case-card__body");
    const heading = text(body?.querySelector("h2.case-card__title, h2, h3"));
    const items = Array.from(body?.querySelectorAll("ul li, ol li") ?? [])
      .map((li) => text(li))
      .filter(Boolean);

    const media = card.querySelector(".case-card__media");
    const images = imagesFromScope(media ?? card);

    const paras = Array.from(body?.querySelectorAll("p") ?? [])
      .map((p) => text(p))
      .filter(Boolean);

    if (!heading && !items.length && !images.length && !paras.length) continue;
    sections.push({ heading, items, images, content: paragraphs(paras) });
  }

  /** Pattern B: `.case-section` (Landstar/Phoney/Ford) — h2 + p(s) + img inline. */
  if (sections.length === 0) {
    const caseSections = Array.from(
      doc.querySelectorAll<HTMLElement>(".case-section")
    );
    for (const sec of caseSections) {
      const heading = text(sec.querySelector("h2, h3"));
      const items = Array.from(sec.querySelectorAll(":scope > ul li, :scope > ol li"))
        .map((li) => text(li))
        .filter(Boolean);
      const images = imagesFromScope(sec);
      const paras = Array.from(sec.querySelectorAll(":scope > p"))
        .map((p) => text(p))
        .filter(Boolean);

      if (!heading && !items.length && !images.length && !paras.length) continue;
      sections.push({ heading, items, images, content: paragraphs(paras) });
    }
  }

  return { title, summary, sections };
}

function imagesFromScope(scope: Element | null): CaseStudyImage[] {
  if (!scope) return [];
  return Array.from(scope.querySelectorAll<HTMLImageElement>("img"))
    .map((img) => ({
      src: img.getAttribute("src") ?? "",
      alt: img.getAttribute("alt") ?? "",
    }))
    .filter((i) => i.src);
}

function paragraphs(paras: string[]): ReactNode {
  if (!paras.length) return undefined;
  return (
    <div className="space-y-3">
      {paras.map((p, i) => (
        <p key={`${p.slice(0, 24)}-${i}`}>{p}</p>
      ))}
    </div>
  );
}
