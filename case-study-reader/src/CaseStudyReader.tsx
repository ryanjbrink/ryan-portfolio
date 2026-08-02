import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/* ────────────────────────────────────────────────────────────────────────── *
 * CaseStudyReader
 *
 * Desktop: three-column scrollytelling (TOC | media | content).
 * Mobile:  story reel — portrait media + title + one-line summary per beat.
 * ────────────────────────────────────────────────────────────────────────── */

export type CaseStudyImage = { src: string; alt: string };

export type CaseStudyHero =
  | { kind: "image"; src: string; alt: string }
  | { kind: "video"; src: string; poster?: string };

export type CaseStudySection = {
  heading?: string;
  content?: ReactNode;
  items?: string[];
  images?: CaseStudyImage[];
  /** Preferred media for this section (from data-media or first image). */
  media?: CaseStudyHero;
  /** Optional looping sequence (data-media-cycle). */
  mediaCycle?: CaseStudyHero[];
  /** Short mobile caption (data-mobile-summary or first sentence). */
  summary?: string;
};

export type CaseStudyData = {
  title: string;
  tagline: string;
  /** Card label name (e.g. "Landstar") — shown with cardTag at 1.688rem. */
  cardName?: string;
  /** Card label tag (e.g. "hook/drop"). */
  cardTag?: string;
  /** When true, cardTag renders with a strikethrough (home-card match). */
  cardTagStrike?: boolean;
  hero?: CaseStudyHero;
  sections: CaseStudySection[];
};

export type CaseStudyReaderProps = {
  open: boolean;
  onClose: () => void;
  data: CaseStudyData;
  isLoading?: boolean;
  className?: string;
  /**
   * `page` — full viewport reader (dedicated case study URL).
   * `overlay` — modal over the portfolio home (legacy / demo).
   */
  variant?: "overlay" | "page";
  /** Overlay only: size the panel to match this element (e.g. `.home`). */
  anchorSelector?: string;
};

const DURATION_MS = 220;
/** Three-column desktop only when there’s room for a stable 2:3 media frame. */
const XL_QUERY = "(min-width: 1280px)";

const BACKDROP = [
  "absolute inset-0 cursor-default bg-black/35 backdrop-blur-md backdrop-saturate-150",
  "transition duration-200 ease-out",
  "data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
].join(" ");

const PANEL_OVERLAY = [
  "fixed z-[101] flex flex-col overflow-hidden rounded-[26px]",
  "border border-black/[0.06] bg-[#f3f3f0] text-[#0a0a0a]",
  "dark:border-white/[0.08] dark:bg-[#0f0f0f] dark:text-[#e8e8e8]",
  "shadow-[0_25px_60px_-15px_rgba(0,0,0,0.35)]",
  "transition duration-200 ease-out",
  "data-[state=closed]:opacity-0 data-[state=closed]:translate-y-2 data-[state=closed]:scale-[0.985]",
  "data-[state=open]:opacity-100 data-[state=open]:translate-y-0 data-[state=open]:scale-100",
].join(" ");

const PANEL_PAGE = [
  "fixed inset-0 z-[1] flex flex-col overflow-hidden",
  "bg-[#f3f3f0] text-[#0a0a0a]",
  "dark:bg-[#0f0f0f] dark:text-[#e8e8e8]",
].join(" ");

function lockBody(locked: boolean) {
  if (typeof document === "undefined") return;
  if (locked) {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.classList.add("case-study-open");
  } else {
    document.documentElement.style.removeProperty("overflow");
    document.body.style.removeProperty("overflow");
    document.body.classList.remove("case-study-open");
  }
}

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

function useMinXl() {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(XL_QUERY).matches : true
  );
  useEffect(() => {
    const mq = window.matchMedia(XL_QUERY);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return matches;
}

type PanelFrame = { top: number; left: number; width: number; height: number };

/** Size the panel to the anchor’s width/x, but always clamp into the viewport. */
function frameToPanel(rect: DOMRect | null): PanelFrame | null {
  if (!rect || typeof window === "undefined") return null;
  const margin = 16;
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const top = Math.min(Math.max(rect.top, margin), vh - margin * 2);
  const left = Math.min(Math.max(rect.left, margin), vw - margin * 2);
  const height = Math.max(120, Math.min(rect.height, vh - top - margin));
  const width = Math.max(200, Math.min(rect.width, vw - left - margin));
  return { top, left, width, height };
}

function useAnchorFrame(active: boolean, selector?: string) {
  const [frame, setFrame] = useState<PanelFrame | null>(() => {
    if (!selector || typeof document === "undefined") return null;
    const el = document.querySelector(selector);
    return frameToPanel(el?.getBoundingClientRect() ?? null);
  });

  useLayoutEffect(() => {
    if (!active || !selector) {
      setFrame(null);
      return;
    }
    const el = document.querySelector(selector);
    if (!el) return;
    const update = () => setFrame(frameToPanel(el.getBoundingClientRect()));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [active, selector]);

  return frame;
}

function mediaKey(media?: CaseStudyHero) {
  if (!media) return "none";
  return media.kind === "video" ? `v:${media.src}` : `i:${media.src}`;
}

function isDiagramMedia(media?: CaseStudyHero) {
  return Boolean(
    media && media.kind === "image" && /\.svg(\?|$)/i.test(media.src)
  );
}

/** Resolve display media for each section (section media → carry-forward → hero). */
function resolveSectionMedia(
  sections: CaseStudySection[],
  hero?: CaseStudyHero
): (CaseStudyHero | undefined)[] {
  let last = hero;
  return sections.map((section) => {
    const fromSection =
      section.media ??
      section.mediaCycle?.[0] ??
      (section.images?.[0]
        ? {
            kind: "image" as const,
            src: section.images[0].src,
            alt: section.images[0].alt || section.heading || "",
          }
        : undefined);
    if (fromSection) last = fromSection;
    return last;
  });
}

function parseMediaList(
  raw: string | null | undefined,
  alt = ""
): CaseStudyHero[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((src) => {
      if (/\.(mp4|webm|mov)(\?|$)/i.test(src)) {
        return { kind: "video" as const, src };
      }
      return { kind: "image" as const, src, alt };
    });
}

/** First sentence, capped for mobile captions. */
function firstSentence(raw: string, maxLen = 130): string {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const m = t.match(/^(.+?[.!?])(?:\s|$)/);
  let s = m ? m[1] : t;
  if (s.length > maxLen) {
    s = `${s.slice(0, maxLen - 1).replace(/\s+\S*$/, "")}…`;
  }
  return s;
}

export function CaseStudyReader({
  open,
  onClose,
  data,
  isLoading = false,
  className = "",
  variant = "overlay",
  anchorSelector,
}: CaseStudyReaderProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const descId = `${id}-summary`;
  const isPage = variant === "page";
  const mounted = usePresence(open);
  const isXl = useMinXl();
  const frame = useAnchorFrame(mounted && !isPage, anchorSelector);
  const [entered, setEntered] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [portHeight, setPortHeight] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const desktopRootRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);

  const { title, tagline, cardName, cardTag, cardTagStrike, hero, sections } =
    data;
  const labelName = cardName || title || "Case study";

  const cardTagNode = cardTag ? (
    <span className="font-normal text-black/55 dark:text-white/55">
      {" "}
      {cardTagStrike ? <s>{cardTag}</s> : cardTag}
    </span>
  ) : null;
  const sectionMedia = useMemo(
    () => resolveSectionMedia(sections, hero),
    [sections, hero]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  useLayoutEffect(() => {
    if (!open) {
      setEntered(false);
      setActiveIndex(0);
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
      return;
    }
    if (!mounted) return;
    setEntered(true);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    });
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

  // Desktop scrollport height → section “beats”.
  useLayoutEffect(() => {
    if (!mounted || !isXl) return;
    const root = scrollRef.current;
    if (!root) return;
    const update = () => setPortHeight(root.clientHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(root);
    return () => ro.disconnect();
  }, [mounted, open, isXl, frame?.height]);

  // Desktop: wheel anywhere in the reader should drive the content scrollport
  // (TOC / media sit above it and would otherwise swallow the gesture).
  useEffect(() => {
    if (!open || !mounted || !isXl) return;
    const shell = desktopRootRef.current;
    const root = scrollRef.current;
    if (!shell || !root) return;

    const onWheel = (e: WheelEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (root.contains(target)) return;

      const toc = target.closest<HTMLElement>("[data-reader-toc]");
      if (toc && toc.scrollHeight > toc.clientHeight + 1) {
        const atTop = toc.scrollTop <= 0;
        const atBottom =
          toc.scrollTop + toc.clientHeight >= toc.scrollHeight - 1;
        if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom)) return;
      }

      const max = root.scrollHeight - root.clientHeight;
      if (max <= 0) return;

      e.preventDefault();
      root.scrollTop = Math.min(max, Math.max(0, root.scrollTop + e.deltaY));
    };

    shell.addEventListener("wheel", onWheel, { passive: false });
    return () => shell.removeEventListener("wheel", onWheel);
  }, [open, mounted, isXl]);

  // Desktop scroll-spy
  useEffect(() => {
    if (!open || !mounted || !isXl || sections.length === 0) return;
    const root = scrollRef.current;
    if (!root) return;

    let raf = 0;
    const FOCUS_RATIO = 0.28;
    const BOTTOM_EPS = 4;

    const updateActive = () => {
      raf = 0;
      const els = [
        ...root.querySelectorAll<HTMLElement>("[data-section-index]"),
      ];
      if (!els.length) return;

      const maxScroll = root.scrollHeight - root.clientHeight;
      if (maxScroll > BOTTOM_EPS && root.scrollTop >= maxScroll - BOTTOM_EPS) {
        setActiveIndex(els.length - 1);
        return;
      }

      const focusY =
        root.getBoundingClientRect().top + root.clientHeight * FOCUS_RATIO;
      let next = 0;
      for (let i = 0; i < els.length; i++) {
        if (els[i].getBoundingClientRect().top <= focusY) next = i;
        else break;
      }
      setActiveIndex(next);
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(updateActive);
    };

    updateActive();
    root.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(onScroll);
    ro.observe(root);
    return () => {
      root.removeEventListener("scroll", onScroll);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [open, mounted, isXl, sections.length, title, portHeight]);

  const scrollToSection = useCallback((index: number) => {
    const el = sectionRefs.current[index];
    const root = scrollRef.current;
    if (!el || !root) return;
    const last = index >= sectionRefs.current.length - 1;
    const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
    const top = last
      ? maxScroll
      : el.getBoundingClientRect().top -
        root.getBoundingClientRect().top +
        root.scrollTop -
        24;
    root.scrollTo({ top, behavior: "smooth" });
    setActiveIndex(index);
  }, []);

  if (typeof document === "undefined" || !mounted) return null;

  const state = open && entered ? "open" : "closed";
  const panelStyle: CSSProperties | undefined =
    !isPage && frame
      ? {
          top: frame.top,
          left: frame.left,
          width: frame.width,
          height: frame.height,
        }
      : undefined;

  const activeMedia = sectionMedia[activeIndex] ?? hero;

  const shell = (
    <div
      className={isPage ? "contents" : "fixed inset-0 z-[100]"}
      role="presentation"
    >
      {!isPage ? (
        <button
          type="button"
          aria-label="Close case study"
          className={BACKDROP}
          data-state={state}
          onClick={onClose}
        />
      ) : null}

      <div
        role={isPage ? "main" : "dialog"}
        aria-modal={isPage ? undefined : true}
        aria-labelledby={labelId}
        aria-describedby={descId}
        {...(isLoading ? { "aria-busy": true as const } : {})}
        data-state={state}
        className={[
          isPage ? PANEL_PAGE : PANEL_OVERLAY,
          !isPage && !frame ? "inset-6" : "",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        style={panelStyle}
        onClick={isPage ? undefined : (e) => e.stopPropagation()}
      >
        {!isPage ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={[
              "absolute right-4 top-4 z-20 shrink-0 rounded-full p-2",
              "bg-black/[0.05] text-black/70 dark:bg-white/[0.08] dark:text-white/70",
              "border border-black/[0.06] dark:border-white/[0.1]",
              "transition duration-200 ease-out",
              "hover:bg-black/[0.1] hover:text-black dark:hover:bg-white/[0.14] dark:hover:text-white",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/25",
            ].join(" ")}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}

        <div className="relative min-h-0 flex-1">
          <h1 id={labelId} className="sr-only">
            {title || "Case study"}
          </h1>
          {tagline ? (
            <p id={descId} className="sr-only">
              {tagline}
            </p>
          ) : (
            <span id={descId} className="sr-only">
              Case study
            </span>
          )}

          {/* ── Mobile story reel ─────────────────────────────────────── */}
          <MobileStoryReel
            labelName={labelName}
            cardTag={cardTag}
            cardTagStrike={cardTagStrike}
            tagline={tagline}
            sections={sections}
            sectionMedia={sectionMedia}
            hero={hero}
            isLoading={isLoading}
            showHome={isPage}
            onHome={onClose}
            activeIndex={activeIndex}
            onActiveIndexChange={setActiveIndex}
          />

          {/* ── Desktop three-column reader ───────────────────────────── */}
          <div ref={desktopRootRef} className="relative hidden h-full xl:block">
            <div
              className={[
                "pointer-events-none absolute inset-0 z-10 grid",
                "grid-cols-[minmax(0,1fr)_minmax(0,36%)_minmax(0,1fr)] grid-rows-1",
              ].join(" ")}
            >
              <aside className="flex h-full flex-col overflow-hidden px-6 pb-8 pt-12 lg:px-10 lg:pt-14">
                <header className="shrink-0">
                  {isPage ? (
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Back to home"
                      className={[
                        "pointer-events-auto mb-5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                        "bg-white/70 text-black border border-black/10",
                        "dark:bg-white/10 dark:text-white dark:border-white/15",
                        "shadow-[0_6px_18px_rgba(0,12,20,0.08)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.35)] backdrop-blur-md backdrop-saturate-150",
                        "transition duration-200 hover:bg-white hover:-translate-y-px dark:hover:bg-white/20",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/25",
                      ].join(" ")}
                    >
                      <svg
                        className="h-[1.15rem] w-[1.15rem]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        aria-hidden
                      >
                        <path
                          d="M15 6l-6 6 6 6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  ) : null}
                  <p className="min-w-0 text-[1.688rem] leading-none tracking-[-0.02em] text-black dark:text-white">
                    <span className="font-semibold">{labelName}</span>
                    {cardTagNode}
                  </p>
                  {tagline ? (
                    <p className="mt-4 max-w-[14em] text-[2.938rem] font-semibold leading-[1.12] tracking-[-0.02em] text-black dark:text-white">
                      {tagline}
                    </p>
                  ) : null}
                </header>

                <nav
                  data-reader-toc
                  aria-label="Table of contents"
                  className="mt-10 min-h-0 overflow-y-auto overscroll-contain"
                >
                  <ul className="space-y-1">
                    {sections.map((section, i) => {
                      const label = section.heading || `Section ${i + 1}`;
                      const active = i === activeIndex;
                      const indexLabel = String(i + 1).padStart(2, "0");
                      return (
                        <li key={`${label}-${i}`}>
                          <button
                            type="button"
                            onClick={() => scrollToSection(i)}
                            className={[
                              "pointer-events-auto group flex w-full items-baseline gap-3 py-2 text-left transition",
                              "border-l-2 pl-3",
                              active
                                ? "border-black text-black dark:border-white dark:text-white"
                                : "border-transparent text-black/40 hover:border-black/15 hover:text-black/70 dark:text-white/40 dark:hover:border-white/20 dark:hover:text-white/75",
                            ].join(" ")}
                            aria-current={active ? "true" : undefined}
                          >
                            <span
                              className={[
                                "shrink-0 text-[0.8rem] font-medium tracking-[0.04em] tabular-nums",
                                active
                                  ? "text-black/45 dark:text-white/45"
                                  : "text-black/30 group-hover:text-black/45 dark:text-white/30 dark:group-hover:text-white/45",
                              ].join(" ")}
                            >
                              {indexLabel}
                            </span>
                            <span
                              className={[
                                "min-w-0 text-[0.95rem] leading-snug tracking-[-0.01em]",
                                active ? "font-medium" : "font-normal",
                              ].join(" ")}
                            >
                              {label}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {!sections.length && isLoading ? (
                      <li className="pl-3 py-2 text-[0.95rem] text-black/35 dark:text-white/35">
                        Loading…
                      </li>
                    ) : null}
                  </ul>
                </nav>
              </aside>

              <div className="flex min-h-0 items-center justify-center px-4 pb-8 pt-12 lg:px-6 lg:pt-14">
                {/*
                  Lock 2:3 so the frame never inherits a squished column aspect.
                  Height fills the column; width follows aspect, capped by column.
                */}
                <div className="pointer-events-auto relative aspect-[2/3] h-full max-h-full w-auto max-w-full overflow-hidden rounded-[28px] bg-[#d9d9d6] dark:bg-[#1a1a1a]">
                  <MediaStage
                    media={activeMedia}
                    cycle={sections[activeIndex]?.mediaCycle}
                    heading={sections[activeIndex]?.heading}
                    showCaption={false}
                    cycleControls
                  />
                </div>
              </div>

              <div aria-hidden />
            </div>

            <div
              ref={scrollRef}
              className="absolute inset-0 snap-y snap-mandatory overflow-y-auto overscroll-contain"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,36%)_minmax(0,1fr)]">
                <div aria-hidden />
                <div aria-hidden />
                <div className="px-6 pb-8 pt-12 lg:px-10 lg:pt-14">
                  {isLoading && sections.length === 0 ? (
                    <ContentSkeleton />
                  ) : (
                    <div className="w-full max-w-[34ch] pb-16">
                      {sections.map((section, i) => (
                        <section
                          key={`${section.heading ?? "section"}-${i}`}
                          ref={(el) => {
                            sectionRefs.current[i] = el;
                          }}
                          data-section-index={i}
                          className="relative snap-start snap-always scroll-mt-6"
                          style={
                            portHeight
                              ? ({
                                  ["--beat-desktop" as string]: `${Math.round(portHeight * 1.12)}px`,
                                } as CSSProperties)
                              : undefined
                          }
                        >
                          <div className="flex min-h-[var(--beat-desktop,112vh)] flex-col pb-[18vh]">
                            <div className="sticky top-12 lg:top-14">
                              <ContentSection section={section} />
                            </div>
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(shell, document.body);
}

/* ─── Mobile story reel ───────────────────────────────────────────────────── */

function MobileStoryReel({
  labelName,
  cardTag,
  cardTagStrike,
  tagline,
  sections,
  sectionMedia,
  hero,
  isLoading,
  showHome,
  onHome,
  activeIndex,
  onActiveIndexChange,
}: {
  labelName: string;
  cardTag?: string;
  cardTagStrike?: boolean;
  tagline: string;
  sections: CaseStudySection[];
  sectionMedia: (CaseStudyHero | undefined)[];
  hero?: CaseStudyHero;
  isLoading: boolean;
  showHome: boolean;
  onHome: () => void;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<(HTMLElement | null)[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || sections.length === 0) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const els = sectionRefs.current.filter(Boolean) as HTMLElement[];
      if (!els.length) return;
      const focusY = root.scrollTop + root.clientHeight * 0.45;
      let next = 0;
      for (let i = 0; i < els.length; i++) {
        if (els[i].offsetTop <= focusY) next = i;
        else break;
      }
      onActiveIndexChange(next);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    update();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [sections.length, onActiveIndexChange]);

  const goTo = useCallback(
    (index: number) => {
      const el = sectionRefs.current[index];
      const root = scrollRef.current;
      if (!el || !root) return;
      root.scrollTo({ top: el.offsetTop, behavior: "smooth" });
      onActiveIndexChange(index);
    },
    [onActiveIndexChange]
  );

  const expandedSection =
    expanded !== null ? sections[expanded] : undefined;

  return (
    <div className="relative h-full bg-black xl:hidden">
      {showHome ? (
        <button
          type="button"
          onClick={onHome}
          aria-label="Back to home"
          className={[
            "absolute left-4 top-4 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full",
            "bg-white/70 text-black border border-black/10",
            "dark:bg-white/10 dark:text-white dark:border-white/15",
            "shadow-[0_6px_18px_rgba(0,12,20,0.08)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.35)] backdrop-blur-md backdrop-saturate-150",
            "transition duration-200 hover:bg-white hover:-translate-y-px dark:hover:bg-white/20",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 dark:focus-visible:ring-white/25",
          ].join(" ")}
        >
          <svg
            className="h-[1.15rem] w-[1.15rem]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            aria-hidden
          >
            <path
              d="M15 6l-6 6 6 6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}

      <div
        ref={scrollRef}
        className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
      >
        {isLoading && sections.length === 0 ? (
          <div className="flex h-full items-center justify-center bg-[#f3f3f0] px-6 dark:bg-[#0f0f0f]">
            <ContentSkeleton />
          </div>
        ) : (
          sections.map((section, i) => {
            const media = sectionMedia[i] ?? hero;
            const caption =
              section.summary ||
              (i === 0 && tagline ? firstSentence(tagline) : "");
            const diagram = isDiagramMedia(media);

            return (
              <section
                key={`m-${section.heading ?? "section"}-${i}`}
                ref={(el) => {
                  sectionRefs.current[i] = el;
                }}
                data-mobile-section={i}
                className="relative h-[100dvh] w-full snap-start snap-always overflow-hidden"
              >
                <div
                  className={[
                    "absolute inset-0",
                    diagram
                      ? "bg-[#e8e8e4] dark:bg-[#1c1c1c]"
                      : "bg-[#1a1a1a]",
                  ].join(" ")}
                >
                  <MediaStage
                    media={media}
                    cycle={section.mediaCycle}
                    heading={section.heading}
                    showCaption={false}
                    fit={diagram ? "contain" : "cover"}
                  />
                </div>

                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-[48%] bg-gradient-to-t from-black via-black/55 to-transparent"
                  aria-hidden
                />

                <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col px-5 pb-[calc(2.75rem+env(safe-area-inset-bottom))] pt-10">
                  {i === 0 ? (
                    <p className="mb-2 text-[1rem] font-medium tracking-[-0.01em] text-white/70">
                      <span className="text-white">{labelName}</span>
                      {cardTag ? (
                        <span className="font-normal text-white/55">
                          {" "}
                          {cardTagStrike ? <s>{cardTag}</s> : cardTag}
                        </span>
                      ) : null}
                    </p>
                  ) : null}

                  {section.heading ? (
                    <h2 className="text-[1.45rem] font-semibold leading-tight tracking-[-0.02em] text-white">
                      {section.heading}
                    </h2>
                  ) : null}

                  {caption ? (
                    <p className="mt-2 max-w-[34ch] text-[1rem] leading-snug text-white/80">
                      {caption}
                    </p>
                  ) : null}

                  {section.content ||
                  (section.items && section.items.length) ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(i)}
                      className="pointer-events-auto mt-3 self-start text-[1rem] font-medium text-white/90 underline decoration-white/35 underline-offset-4 transition hover:decoration-white/70"
                    >
                      Read more
                    </button>
                  ) : null}
                </div>
              </section>
            );
          })
        )}
      </div>

      {sections.length > 1 ? (
        <nav
          aria-label="Sections"
          className="pointer-events-none absolute inset-x-0 bottom-[calc(0.85rem+env(safe-area-inset-bottom))] z-20 flex justify-center gap-1.5"
        >
          {sections.map((section, i) => {
            const active = i === activeIndex;
            return (
              <button
                key={`dot-${section.heading ?? i}`}
                type="button"
                aria-label={section.heading || `Section ${i + 1}`}
                aria-current={active ? "true" : undefined}
                onClick={() => goTo(i)}
                className={[
                  "pointer-events-auto h-1.5 rounded-full transition-all",
                  active
                    ? "w-5 bg-white"
                    : "w-1.5 bg-white/40 hover:bg-white/65",
                ].join(" ")}
              />
            );
          })}
        </nav>
      ) : null}

      {expanded !== null && expandedSection ? (
        <div className="absolute inset-0 z-40 flex flex-col bg-[#f3f3f0] dark:bg-[#0f0f0f]">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3 dark:border-white/[0.08]">
            <p className="text-[1rem] font-medium text-black/45 dark:text-white/45">
              {labelName}
            </p>
            <button
              type="button"
              onClick={() => setExpanded(null)}
              className="rounded-full px-3 py-1.5 text-[1rem] font-medium text-black/70 transition hover:bg-black/[0.05] dark:text-white/70 dark:hover:bg-white/[0.08]"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6">
            <ContentSection section={expandedSection} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ─── subcomponents ───────────────────────────────────────────────────────── */

const MEDIA_CYCLE_MS = 2800;

function MediaStage({
  media,
  cycle,
  heading,
  showCaption = true,
  fit = "cover",
  cycleControls = false,
}: {
  media?: CaseStudyHero;
  cycle?: CaseStudyHero[];
  heading?: string;
  showCaption?: boolean;
  fit?: "cover" | "contain";
  /** Desktop: dots + click-to-advance; pauses auto-cycle after interaction. */
  cycleControls?: boolean;
}) {
  const frames = useMemo(() => {
    if (cycle && cycle.length > 1) return cycle;
    return media ? [media] : [];
  }, [cycle, media]);
  const cycleKey = frames.map((f) => mediaKey(f)).join("|");
  const [frameIndex, setFrameIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const multi = frames.length > 1;

  useEffect(() => {
    setFrameIndex(0);
    setPaused(false);
  }, [cycleKey]);

  useEffect(() => {
    if (!multi || paused) return;
    const id = window.setInterval(() => {
      setFrameIndex((i) => (i + 1) % frames.length);
    }, MEDIA_CYCLE_MS);
    return () => window.clearInterval(id);
  }, [cycleKey, frames.length, multi, paused]);

  const goTo = useCallback(
    (index: number) => {
      setFrameIndex(((index % frames.length) + frames.length) % frames.length);
      if (cycleControls) setPaused(true);
    },
    [frames.length, cycleControls]
  );

  const advance = useCallback(() => {
    if (!multi) return;
    setFrameIndex((i) => (i + 1) % frames.length);
    if (cycleControls) setPaused(true);
  }, [multi, frames.length, cycleControls]);

  const objectClass =
    fit === "contain"
      ? "h-full w-full object-contain p-5"
      : "h-full w-full object-cover";

  return (
    <div
      className="absolute inset-0"
      role={multi ? "group" : undefined}
      aria-roledescription={multi ? "carousel" : undefined}
      aria-label={
        multi
          ? `${heading || "Media"}, image ${frameIndex + 1} of ${frames.length}`
          : undefined
      }
    >
      {frames.length ? (
        frames.map((frame, i) => {
          const active = i === frameIndex;
          return (
            <div
              key={`${mediaKey(frame)}-${i}`}
              className={[
                "absolute inset-0 transition-opacity duration-500 ease-out",
                active ? "opacity-100" : "opacity-0",
              ].join(" ")}
              aria-hidden={!active}
            >
              {frame.kind === "video" ? (
                <SectionVideo
                  src={frame.src}
                  poster={frame.poster}
                  fit={fit}
                  active={active}
                />
              ) : (
                <img
                  src={frame.src}
                  alt={active ? frame.alt || heading || "" : ""}
                  className={objectClass}
                />
              )}
            </div>
          );
        })
      ) : (
        <div className="flex h-full w-full items-center justify-center px-6 text-center">
          <p className="text-[1rem] font-medium text-black/40 dark:text-white/40">
            {heading || "Media"}
          </p>
        </div>
      )}

      {cycleControls && multi ? (
        <>
          <button
            type="button"
            onClick={advance}
            aria-label="Next image"
            className="absolute inset-0 z-10 cursor-pointer bg-transparent"
          />
          <nav
            aria-label="Images in this section"
            className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center gap-1.5"
          >
            {frames.map((frame, i) => {
              const active = i === frameIndex;
              return (
                <button
                  key={`dot-${mediaKey(frame)}-${i}`}
                  type="button"
                  aria-label={`Image ${i + 1} of ${frames.length}`}
                  aria-current={active ? "true" : undefined}
                  onClick={(e) => {
                    e.stopPropagation();
                    goTo(i);
                  }}
                  className={[
                    "pointer-events-auto h-1.5 rounded-full transition-all",
                    active
                      ? "w-5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
                      : "w-1.5 bg-white/55 hover:bg-white/80",
                  ].join(" ")}
                />
              );
            })}
          </nav>
        </>
      ) : null}

      {showCaption ? (
        <>
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/35 to-transparent"
            aria-hidden
          />
          {heading ? (
            <p className="pointer-events-none absolute bottom-4 left-4 right-4 text-[1rem] font-semibold text-white drop-shadow">
              {heading}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SectionVideo({
  src,
  poster,
  fit = "cover",
  active = true,
}: {
  src: string;
  poster?: string;
  fit?: "cover" | "contain";
  active?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const objectClass =
    fit === "contain"
      ? "h-full w-full object-contain"
      : "h-full w-full object-cover";

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) {
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [active]);

  return (
    <div className="relative h-full w-full">
      {poster ? (
        <img
          src={poster}
          alt=""
          aria-hidden
          className={[
            "absolute inset-0 transition-opacity duration-300",
            objectClass,
            ready ? "opacity-0" : "opacity-100",
          ].join(" ")}
        />
      ) : null}
      <video
        ref={videoRef}
        key={src}
        src={src}
        poster={poster}
        autoPlay={active}
        muted
        loop
        playsInline
        preload="auto"
        onCanPlay={() => setReady(true)}
        className={[
          "transition-opacity duration-300",
          objectClass,
          ready ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="space-y-10" role="status" aria-label="Loading case study">
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse space-y-3">
          <div className="h-6 w-40 rounded-md bg-black/[0.08] dark:bg-white/[0.1]" />
          <div className="h-4 w-full rounded bg-black/[0.05] dark:bg-white/[0.06]" />
          <div className="h-4 w-[90%] rounded bg-black/[0.05] dark:bg-white/[0.06]" />
          <div className="h-4 w-[75%] rounded bg-black/[0.05] dark:bg-white/[0.06]" />
        </div>
      ))}
    </div>
  );
}

function ContentSection({ section }: { section: CaseStudySection }) {
  const { heading, content, items } = section;
  return (
    <div className="space-y-4 xl:space-y-5">
      {heading ? (
        <h3 className="text-[1.45rem] font-semibold leading-snug tracking-[-0.02em] text-black dark:text-white xl:text-[1.688rem] xl:leading-tight">
          {heading}
        </h3>
      ) : null}

      {content ? (
        <div className="text-[1rem] leading-[1.65] text-black/75 dark:text-white/75 xl:leading-[1.7] xl:text-black/70 xl:dark:text-white/70 [&_a]:text-sky-700 [&_a]:underline-offset-2 hover:[&_a]:text-sky-800 dark:[&_a]:text-sky-400 dark:hover:[&_a]:text-sky-300 [&_em]:not-italic [&_p+p]:mt-4 xl:[&_p+p]:mt-5">
          {content}
        </div>
      ) : null}

      {items && items.length > 0 ? (
        <ul className="list-disc space-y-2 pl-5 text-[1rem] leading-[1.6] text-black/75 marker:text-black/30 dark:text-white/75 dark:marker:text-white/30 xl:leading-[1.65] xl:text-black/70 xl:dark:text-white/70">
          {items.map((it, idx) => (
            <li key={`${it.slice(0, 24)}-${idx}`}>{it}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/* ─── HTML → CaseStudyData ────────────────────────────────────────────────── */

function text(el: Element | null | undefined) {
  return el?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

export function parseCaseStudyHtml(html: string): CaseStudyData {
  if (typeof DOMParser === "undefined") {
    return { title: "Case study", tagline: "", sections: [] };
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  return parseCaseStudyFromDocument(doc);
}

export function parseCaseStudyFromDocument(doc: Document): CaseStudyData {
  const h1 = doc.querySelector<HTMLElement>(
    ".case-hero-title, article h1, h1"
  );
  const title = text(h1) || "Case study";

  const tagline =
    text(doc.querySelector(".case-hero-tagline")) ||
    text(doc.querySelector(".case-hero-subtitle"));

  const article = doc.querySelector<HTMLElement>("article.case-study");
  const cardName =
    article?.getAttribute("data-card-name")?.trim() || undefined;
  const cardTag = article?.getAttribute("data-card-tag")?.trim() || undefined;
  const cardTagStrike = article?.hasAttribute("data-card-tag-strike") ?? false;

  const hero = parseHero(doc);

  const sections: CaseStudySection[] = [];
  const sectionEls = Array.from(
    doc.querySelectorAll<HTMLElement>(".case-section")
  );
  for (const sec of sectionEls) {
    const heading = text(sec.querySelector("h2, h3"));
    const items = Array.from(
      sec.querySelectorAll(":scope > ul li, :scope > ol li")
    )
      .map((li) => text(li))
      .filter(Boolean);
    const images = Array.from(sec.querySelectorAll<HTMLImageElement>("img"))
      .filter((img) => !img.classList.contains("case-hero-media"))
      .map((img) => ({
        src: img.getAttribute("src") ?? "",
        alt: img.getAttribute("alt") ?? "",
      }))
      .filter((i) => i.src);

    const dataMedia = sec.getAttribute("data-media")?.trim();
    const dataMediaPoster = sec.getAttribute("data-media-poster")?.trim();
    const dataMediaKind = sec.getAttribute("data-media-kind")?.trim();
    const mediaCycle = parseMediaList(
      sec.getAttribute("data-media-cycle"),
      heading || ""
    );
    let media: CaseStudyHero | undefined;
    if (dataMedia) {
      if (
        dataMediaKind === "video" ||
        /\.(mp4|webm|mov)(\?|$)/i.test(dataMedia)
      ) {
        media = {
          kind: "video",
          src: dataMedia,
          poster: dataMediaPoster,
        };
      } else {
        media = {
          kind: "image",
          src: dataMedia,
          alt: heading || "",
        };
      }
    } else if (mediaCycle[0]) {
      media = mediaCycle[0];
    } else if (images[0]) {
      media = {
        kind: "image",
        src: images[0].src,
        alt: images[0].alt || heading || "",
      };
    }

    const paras = Array.from(sec.querySelectorAll(":scope > p"))
      .map((p) => text(p))
      .filter(Boolean);
    const quotes = Array.from(sec.querySelectorAll(":scope > blockquote"))
      .map((q) => text(q))
      .filter(Boolean);
    const allCopy = [
      ...paras,
      ...quotes.map((q) => `“${q.replace(/^["“]|["”]$/g, "")}”`),
    ];

    const mobileSummaryAttr = sec
      .getAttribute("data-mobile-summary")
      ?.trim();
    const summary =
      mobileSummaryAttr ||
      (paras[0] ? firstSentence(paras[0]) : undefined);

    if (
      !heading &&
      !items.length &&
      !images.length &&
      !allCopy.length &&
      !media &&
      !mediaCycle.length
    ) {
      continue;
    }
    sections.push({
      heading,
      items,
      images,
      media,
      mediaCycle: mediaCycle.length > 1 ? mediaCycle : undefined,
      summary,
      content: paragraphs(allCopy),
    });
  }

  return { title, tagline, cardName, cardTag, cardTagStrike, hero, sections };
}

function parseHero(doc: Document): CaseStudyHero | undefined {
  const video = doc.querySelector<HTMLVideoElement>("video.case-hero-media");
  if (video) {
    const src =
      video.getAttribute("src") ||
      video.querySelector("source")?.getAttribute("src") ||
      "";
    if (src) {
      return {
        kind: "video",
        src,
        poster: video.getAttribute("poster") ?? undefined,
      };
    }
  }

  const img = doc.querySelector<HTMLImageElement>("img.case-hero-media");
  if (img?.getAttribute("src")) {
    return {
      kind: "image",
      src: img.getAttribute("src") ?? "",
      alt: img.getAttribute("alt") ?? "",
    };
  }

  return undefined;
}

function paragraphs(paras: string[]): ReactNode {
  if (!paras.length) return undefined;
  return (
    <div className="space-y-4">
      {paras.map((p, i) =>
        p.startsWith("“") ? (
          <blockquote
            key={`${p.slice(0, 24)}-${i}`}
            className="border-l-2 border-black/15 pl-5 italic text-black/65 dark:border-white/20 dark:text-white/65"
          >
            <p>{p}</p>
          </blockquote>
        ) : (
          <p key={`${p.slice(0, 24)}-${i}`}>{p}</p>
        )
      )}
    </div>
  );
}
