/**
 * Lightweight session analytics — no cookies, no PII.
 * Batches events to the Cloudflare Worker (no-ops if endpoint empty).
 *
 * Hardening notes:
 * - sendBeacon uses text/plain (JSON application/json cannot CORS-preflight via beacon)
 * - exits/heartbeats are deduped; queue is capped; flush retries on failure
 */
(function () {
  const cfg = window.RB_ANALYTICS || {};
  const ENDPOINT = String(cfg.endpoint || "").replace(/\/+$/, "");
  if (!ENDPOINT) return;

  const path = location.pathname || "";
  if (/(^|\/)stats\.html$/i.test(path)) return;

  const STORAGE_KEY = "rb_analytics_session_v1";
  const VISITOR_KEY = "rb_analytics_visitor_v1";
  const FLUSH_MS = 5000;
  const HEARTBEAT_MS = 20000;
  const MAX_QUEUE = 60;

  function uuid() {
    try {
      if (crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (_) {}
    return "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getVisitorId() {
    try {
      let id = localStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = "v_" + uuid();
        localStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch (_) {
      return "v_" + uuid();
    }
  }

  function deviceClass() {
    const w = Math.min(screen.width || window.innerWidth || 1200, window.innerWidth || 1200);
    if (w < 768) return "mobile";
    if (w < 1100) return "tablet";
    return "desktop";
  }

  function readUtm() {
    try {
      const q = new URLSearchParams(location.search);
      return {
        source: q.get("utm_source") || "",
        medium: q.get("utm_medium") || "",
        campaign: q.get("utm_campaign") || "",
      };
    } catch (_) {
      return { source: "", medium: "", campaign: "" };
    }
  }

  function normalizePath(p) {
    if (!p) return "/";
    try {
      if (p.startsWith("http")) p = new URL(p).pathname;
    } catch (_) {}
    p = String(p).split("?")[0].split("#")[0] || "/";
    if (p === "/index.html" || p.endsWith("/index.html")) p = "/";
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p || "/";
  }

  function getSession() {
    let raw = null;
    try {
      raw = sessionStorage.getItem(STORAGE_KEY);
    } catch (_) {}
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.id) return parsed;
      } catch (_) {}
    }
    const s = {
      id: uuid(),
      startedAt: Date.now(),
      landingPath: normalizePath(location.pathname || "/"),
      referrer: document.referrer || "",
      utm: readUtm(),
      device: deviceClass(),
    };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (_) {}
    return s;
  }

  const session = getSession();
  const visitorId = getVisitorId();
  let queue = [];
  let maxScroll = 0;
  let pageStarted = Date.now();
  let flushTimer = null;
  let flushing = false;
  let ending = false;
  const milestones = new Set();

  function enqueue(type, meta) {
    if (ending && type !== "exit") return;
    queue.push({
      type: String(type || "event").slice(0, 40),
      ts: Date.now(),
      path: normalizePath(location.pathname || "/"),
      title: String(document.title || "").slice(0, 160),
      meta: meta || {},
    });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    if (queue.length >= 12) flush(false);
    else scheduleFlush();
  }

  function scheduleFlush() {
    if (flushTimer || flushing) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush(false);
    }, FLUSH_MS);
  }

  function buildPayload(events) {
    return JSON.stringify({
      sessionId: session.id,
      visitorId,
      startedAt: session.startedAt,
      landingPath: session.landingPath,
      referrer: session.referrer,
      device: session.device,
      utm: session.utm,
      events,
    });
  }

  function flush(useBeacon) {
    if (!queue.length || flushing) return;
    const events = queue.slice();
    queue = [];
    const payload = buildPayload(events);
    const url = ENDPOINT + "/collect";

    if (useBeacon && typeof navigator.sendBeacon === "function") {
      // text/plain avoids CORS preflight (JSON Content-Type cannot beacon cross-origin)
      const ok = navigator.sendBeacon(url, new Blob([payload], { type: "text/plain;charset=UTF-8" }));
      if (!ok) queue = events.concat(queue).slice(-MAX_QUEUE);
      return;
    }

    flushing = true;
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: payload,
      keepalive: true,
      mode: "cors",
      credentials: "omit",
    })
      .then((res) => {
        if (!res.ok) throw new Error("collect " + res.status);
      })
      .catch(() => {
        queue = events.concat(queue).slice(-MAX_QUEUE);
        scheduleFlush();
      })
      .finally(() => {
        flushing = false;
      });
  }

  function scrollDepth() {
    const doc = document.documentElement;
    const scrollTop = window.scrollY || doc.scrollTop || 0;
    const height = Math.max(doc.scrollHeight - window.innerHeight, 1);
    return Math.min(100, Math.round((scrollTop / height) * 100));
  }

  function onScroll() {
    const d = scrollDepth();
    if (d <= maxScroll) return;
    maxScroll = d;
    [25, 50, 75, 100].forEach((m) => {
      if (d >= m && !milestones.has(m)) {
        milestones.add(m);
        enqueue("scroll", { scrollDepth: m, dwellMs: Date.now() - pageStarted });
      }
    });
  }

  function isGoalHref(href) {
    const h = (href || "").toLowerCase();
    if (h.startsWith("mailto:") || h.startsWith("tel:")) return true;
    if (h.includes("linkedin.com")) return true;
    if (h.includes("github.com")) return true;
    if (/\.(pdf)(\?|#|$)/i.test(h)) return true;
    return false;
  }

  function onClick(e) {
    const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (!href || href.startsWith("#")) return;
    const goal = isGoalHref(href);
    try {
      const u = new URL(href, location.href);
      if (!goal && u.hostname === location.hostname) return;
    } catch (_) {
      if (!goal) return;
    }
    enqueue("click", {
      href: href.slice(0, 300),
      text: (a.textContent || "").trim().slice(0, 80),
      dwellMs: Date.now() - pageStarted,
      scrollDepth: maxScroll,
      goal,
      contact: goal,
    });
    // Navigate away soon — flush promptly
    flush(true);
  }

  function endSession() {
    if (ending) return;
    ending = true;
    enqueue("exit", { dwellMs: Date.now() - pageStarted, scrollDepth: maxScroll });
    flush(true);
  }

  enqueue("page_view", { scrollDepth: 0, dwellMs: 0 });
  flush(false);

  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("click", onClick, true);

  setInterval(() => {
    if (document.visibilityState !== "visible" || ending) return;
    enqueue("heartbeat", {
      dwellMs: Date.now() - pageStarted,
      scrollDepth: maxScroll,
    });
    flush(false);
  }, HEARTBEAT_MS);

  // Tab hide: flush dwell, keep session alive if they come back
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      enqueue("heartbeat", {
        dwellMs: Date.now() - pageStarted,
        scrollDepth: maxScroll,
        hidden: true,
      });
      flush(true);
    }
  });

  window.addEventListener("pagehide", endSession);
  window.addEventListener("beforeunload", endSession);
})();
