(function () {
  const PASS_KEY = "rb_stats_pass_v1";
  const cfg = window.RB_ANALYTICS || {};
  const endpoint = String(cfg.endpoint || "").replace(/\/+$/, "");
  const forceDemo = new URLSearchParams(location.search).has("demo");
  // Live whenever an endpoint is set — unless ?demo=1 forces seeded data
  const useDemo = forceDemo || !endpoint;
  const V = window.RB_STATS_VISUALS;
  const SLOTS = 5; // stable rows per column
  const STEPS = 3; // 1st–3rd page columns

  const els = {
    status: document.querySelector("[data-stats-status]"),
    meta: document.querySelector("[data-stats-meta]"),
    kpis: document.querySelector("[data-stats-kpis]"),
    flowColumns: document.querySelector("[data-flow-columns]"),
    flowRibbons: document.querySelector("[data-flow-ribbons]"),
    flowStage: document.querySelector("[data-flow-stage]"),
    sessions: document.querySelector("[data-stats-sessions]"),
    detail: document.querySelector("[data-stats-detail]"),
    pages: document.querySelector("[data-stats-pages]"),
    referrers: document.querySelector("[data-stats-referrers]"),
    ips: document.querySelector("[data-stats-ips]"),
    geoMap: document.querySelector("[data-stats-geo-map]"),
    countries: document.querySelector("[data-stats-countries]"),
    locked: document.querySelector("[data-stats-locked]"),
    app: document.querySelector("[data-stats-app]"),
    range: document.querySelector("[data-stats-range]"),
    flowPanel: document.querySelector("[data-flow-panel]"),
    flowView: document.querySelector("[data-flow-view]"),
    flowDetail: document.querySelector("[data-flow-detail]"),
    detailTitle: document.querySelector("[data-detail-title]"),
    detailKicker: document.querySelector("[data-detail-kicker]"),
  };

  const COUNTRY_NAMES = {
    US: "United States",
    GB: "United Kingdom",
    CA: "Canada",
    AU: "Australia",
    DE: "Germany",
    FR: "France",
    NL: "Netherlands",
    IN: "India",
    BR: "Brazil",
    JP: "Japan",
    KR: "South Korea",
    SG: "Singapore",
    IE: "Ireland",
    ES: "Spain",
    IT: "Italy",
    MX: "Mexico",
    SE: "Sweden",
    NO: "Norway",
    DK: "Denmark",
    FI: "Finland",
    PL: "Poland",
    PT: "Portugal",
    CH: "Switzerland",
    AT: "Austria",
    BE: "Belgium",
    NZ: "New Zealand",
    ZA: "South Africa",
    AE: "United Arab Emirates",
    IL: "Israel",
    PH: "Philippines",
    ID: "Indonesia",
    TH: "Thailand",
    VN: "Vietnam",
    MY: "Malaysia",
    TW: "Taiwan",
    HK: "Hong Kong",
    CN: "China",
    RU: "Russia",
    TR: "Turkey",
    AR: "Argentina",
    CL: "Chile",
    CO: "Colombia",
    NG: "Nigeria",
    EG: "Egypt",
    T1: "Tor / anonymous",
    XX: "Unknown",
  };

  function countryLabel(code) {
    const c = String(code || "").toUpperCase();
    if (!c) return "Unknown";
    return COUNTRY_NAMES[c] || c;
  }

  function placeLabel(row) {
    const bits = [row.city, row.region, row.country ? countryLabel(row.country) : ""]
      .map((s) => String(s || "").trim())
      .filter(Boolean);
    // Dedupe adjacent same strings
    const out = [];
    bits.forEach((b) => {
      if (!out.length || out[out.length - 1].toLowerCase() !== b.toLowerCase()) out.push(b);
    });
    return out.join(", ") || "Unknown";
  }

  let overview = null;
  let filteredSessions = [];
  let activeId = null;
  let rangePreset = "30";
  let rangeStart = 0;
  let rangeEnd = 0;
  let flowModel = null;
  let activeNodeId = null;

  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function endOfDay(ts) {
    const d = new Date(ts);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }

  function toInputDate(ts) {
    const d = new Date(ts);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function applyPreset(preset) {
    const now = Date.now();
    rangeEnd = endOfDay(now);
    if (preset === "custom") return;
    const days = Number(preset) || 30;
    rangePreset = String(days);
    rangeStart = startOfDay(now - (days - 1) * 86400000);
  }

  function rangeLabel() {
    try {
      const a = new Date(rangeStart).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      const b = new Date(rangeEnd).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return a + " – " + b;
    } catch (_) {
      return rangePreset + "d";
    }
  }

  function rangeDayCount() {
    return Math.max(1, Math.round((rangeEnd - rangeStart) / 86400000) + 1);
  }

  applyPreset("30");

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.body).getPropertyValue(name).trim();
    return v || fallback;
  }

  function fmtDuration(ms) {
    if (!ms || ms < 1000) return "<1s";
    const s = Math.round(ms / 1000);
    if (s < 60) return s + "s";
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? m + "m " + rem + "s" : m + "m";
  }

  function fmtTime(ts) {
    try {
      return new Date(ts).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch (_) {
      return "";
    }
  }

  function password() {
    return sessionStorage.getItem(PASS_KEY) || "";
  }

  async function api(path) {
    const res = await fetch(endpoint + path, {
      headers: { Authorization: "Bearer " + password() },
      mode: "cors",
      credentials: "omit",
    });
    if (res.status === 401) throw new Error("unauthorized");
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.json()).error || "";
      } catch (_) {}
      throw new Error(detail || "request failed (" + res.status + ")");
    }
    return res.json();
  }

  function pageVisual(path) {
    return V.pageFor(path);
  }

  function sourceMedia(host) {
    return V.sourceIcon(host || "(direct)");
  }

  function exitIcon() {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 4h6v16h-6v-2h4V6h-4V4ZM3 12l7-6v4h6v4h-6v4l-7-6Z"/></svg>`;
  }

  function fmtDay(ts) {
    try {
      return new Date(ts).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    } catch (_) {
      return "";
    }
  }

  function buildTrendSeries(sessions) {
    const buckets = [];
    const dayMs = 86400000;
    const totalDays = rangeDayCount();
    const step = Math.max(1, Math.ceil(totalDays / 60));
    for (let t = startOfDay(rangeStart); t <= rangeEnd; t += step * dayMs) {
      const start = t;
      const end = endOfDay(Math.min(rangeEnd, t + (step - 1) * dayMs));
      const daySessions = sessions.filter((s) => s.startedAt >= start && s.startedAt <= end);
      const engaged = daySessions.filter((s) => s.engaged).length;
      const bounced = daySessions.filter((s) => s.bounced).length;
      const goals = daySessions.filter((s) => s.goal).length;
      const visitors = new Set(daySessions.map((s) => s.visitorId || s.id)).size;
      const avgMs = daySessions.length
        ? Math.round(
            daySessions.reduce((a, s) => a + (s.durationMs || 0), 0) / daySessions.length
          )
        : 0;
      const pages = daySessions.length
        ? (
            daySessions.reduce((a, s) => a + ((s.pathKeys && s.pathKeys.length) || 1), 0) /
            daySessions.length
          ).toFixed(1)
        : null;
      buckets.push({
        start,
        label: fmtDay(start),
        rate: daySessions.length ? Math.round((engaged / daySessions.length) * 100) : null,
        sessions: daySessions.length || null,
        visitors: daySessions.length ? visitors : null,
        goals: daySessions.length ? goals : null,
        goalRate: daySessions.length ? Math.round((goals / daySessions.length) * 100) : null,
        engaged: daySessions.length ? engaged : null,
        bounced: daySessions.length ? bounced : null,
        avgMs: daySessions.length ? avgMs : null,
        pages,
      });
    }
    return buckets;
  }

    function linePath(values, w, h, pad) {
    const pts = values.map((v, i) => ({ i, v })).filter((p) => p.v != null);
    if (pts.length < 2) return { line: "", area: "", coords: [] };
    const max = Math.max(...pts.map((p) => p.v), 1);
    const min = Math.min(...pts.map((p) => p.v), 0);
    const span = Math.max(max - min, 1);
    // Edge-to-edge on X; slight Y inset so the stroke isn't clipped
    const padY = Math.max(pad, 6);
    const coords = pts.map((p, idx) => {
      const x = (idx / Math.max(pts.length - 1, 1)) * w;
      const y = padY + (h - padY * 2) - ((p.v - min) / span) * (h - padY * 2);
      return { i: p.i, v: p.v, x, y };
    });

    // Soft Catmull-Rom → cubic Bezier (less rigid than hard corners)
    const tension = 0.18;
    let line = "M" + coords[0].x.toFixed(1) + " " + coords[0].y.toFixed(1);
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i === 0 ? 0 : i - 1];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) * tension;
      const c1y = p1.y + (p2.y - p0.y) * tension;
      const c2x = p2.x - (p3.x - p1.x) * tension;
      const c2y = p2.y - (p3.y - p1.y) * tension;
      line +=
        " C" +
        c1x.toFixed(1) +
        " " +
        c1y.toFixed(1) +
        " " +
        c2x.toFixed(1) +
        " " +
        c2y.toFixed(1) +
        " " +
        p2.x.toFixed(1) +
        " " +
        p2.y.toFixed(1);
    }

    const floor = h;
    const area =
      line +
      " L" +
      coords[coords.length - 1].x.toFixed(1) +
      " " +
      floor.toFixed(1) +
      " L" +
      coords[0].x.toFixed(1) +
      " " +
      floor.toFixed(1) +
      " Z";
    return { line, area, coords };
  }

  function sparkSvg(id, path, color, lineOpacity) {
    if (!path.line) {
      return `<div class="stats-kpi-chart-wrap is-empty"><svg class="stats-kpi-chart" viewBox="0 0 280 72" preserveAspectRatio="none" aria-hidden="true"></svg></div>`;
    }
    const op = lineOpacity == null ? 1 : lineOpacity;
    return `
      <div class="stats-kpi-chart-wrap" data-spark-id="${id}">
        <svg class="stats-kpi-chart" viewBox="0 0 280 72" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${color}" stop-opacity="0.22" />
              <stop offset="100%" stop-color="${color}" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path class="stats-kpi-chart-fill" d="${path.area}" fill="url(#${id}-fill)" />
          <path class="stats-kpi-chart-line" d="${path.line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="${op}" vector-effect="non-scaling-stroke" />
          <line class="stats-kpi-crosshair" x1="0" y1="0" x2="0" y2="72" hidden />
          <circle class="stats-kpi-dot" r="3.5" cx="0" cy="0" fill="${color}" hidden />
        </svg>
      </div>`;
  }

  function bindSparkTooltip(wrap, series, path, mode) {
    if (!wrap || !path.coords.length) return;
    const svg = wrap.querySelector(".stats-kpi-chart");
    const cross = svg.querySelector(".stats-kpi-crosshair");
    const dot = svg.querySelector(".stats-kpi-dot");
    const vbW = 280;
    const vbH = 72;
    let active = -1;

    // Portal to body — KPI cards use transform/overflow which break fixed tips
    const tip = document.createElement("div");
    tip.className = "stats-kpi-tip";
    tip.hidden = true;
    tip.setAttribute("role", "tooltip");
    tip.innerHTML =
      '<p class="stats-kpi-tip-date"></p><p class="stats-kpi-tip-value"></p><p class="stats-kpi-tip-meta"></p>';
    document.body.appendChild(tip);
    const tipDate = tip.querySelector(".stats-kpi-tip-date");
    const tipValue = tip.querySelector(".stats-kpi-tip-value");
    const tipMeta = tip.querySelector(".stats-kpi-tip-meta");

    function hide() {
      active = -1;
      tip.hidden = true;
      cross.setAttribute("hidden", "");
      dot.setAttribute("hidden", "");
      wrap.classList.remove("is-scrubbing");
    }

    function placeTip(anchorX, anchorY) {
      tip.hidden = false;
      tip.style.left = anchorX + "px";
      tip.style.top = anchorY + "px";
      tip.style.transform = "translate(-50%, calc(-100% - 10px))";
      const tipRect = tip.getBoundingClientRect();
      const pad = 8;
      let left = anchorX;
      let top = anchorY;
      let transform = "translate(-50%, calc(-100% - 10px))";
      if (tipRect.left < pad) left = pad + tipRect.width / 2;
      if (tipRect.right > window.innerWidth - pad) {
        left = window.innerWidth - pad - tipRect.width / 2;
      }
      if (tipRect.top < pad) {
        transform = "translate(-50%, 12px)";
      }
      tip.style.left = left + "px";
      tip.style.top = top + "px";
      tip.style.transform = transform;
    }

    function showAt(idx) {
      const c = path.coords[idx];
      const b = series[c.i];
      if (!b) return hide();
      active = idx;
      cross.removeAttribute("hidden");
      dot.removeAttribute("hidden");
      wrap.classList.add("is-scrubbing");

      cross.setAttribute("x1", c.x.toFixed(1));
      cross.setAttribute("x2", c.x.toFixed(1));
      dot.setAttribute("cx", c.x.toFixed(1));
      dot.setAttribute("cy", c.y.toFixed(1));

      tipDate.textContent = b.label;
      if (mode === "engagement") {
        tipValue.textContent = b.rate + "% engaged";
        tipMeta.textContent =
          b.sessions +
          " session" +
          (b.sessions === 1 ? "" : "s") +
          " · " +
          b.engaged +
          " engaged · " +
          b.bounced +
          " bounce" +
          (b.bounced === 1 ? "" : "s") +
          " · avg " +
          fmtDuration(b.avgMs);
      } else if (mode === "visitors") {
        tipValue.textContent =
          b.visitors + " visitor" + (b.visitors === 1 ? "" : "s");
        tipMeta.textContent =
          b.sessions +
          " session" +
          (b.sessions === 1 ? "" : "s") +
          (b.rate != null ? " · " + b.rate + "% engaged" : "");
      } else if (mode === "goals") {
        tipValue.textContent = (b.goalRate != null ? b.goalRate : 0) + "% goal rate";
        tipMeta.textContent =
          (b.goals || 0) +
          " goal session" +
          (b.goals === 1 ? "" : "s") +
          " · " +
          b.sessions +
          " total";
      } else {
        tipValue.textContent =
          b.sessions + " session" + (b.sessions === 1 ? "" : "s");
        tipMeta.textContent =
          (b.rate != null ? b.rate + "% engaged · " : "") +
          "avg " +
          fmtDuration(b.avgMs) +
          (b.pages ? " · " + b.pages + " pages" : "");
      }

      const rect = svg.getBoundingClientRect();
      const anchorX = rect.left + (c.x / vbW) * rect.width;
      const anchorY = rect.top + (c.y / vbH) * rect.height;
      placeTip(anchorX, anchorY);
    }

    function nearest(clientX) {
      const rect = svg.getBoundingClientRect();
      if (!rect.width) return -1;
      const x = ((clientX - rect.left) / rect.width) * vbW;
      let best = 0;
      let bestDist = Infinity;
      path.coords.forEach((c, idx) => {
        const d = Math.abs(c.x - x);
        if (d < bestDist) {
          bestDist = d;
          best = idx;
        }
      });
      return best;
    }

    wrap.addEventListener("pointerenter", (e) => showAt(nearest(e.clientX)));
    wrap.addEventListener("pointermove", (e) => {
      const idx = nearest(e.clientX);
      if (idx !== active) showAt(idx);
    });
    wrap.addEventListener("pointerleave", hide);

    // Clean up orphaned tips when KPIs re-render
    wrap.addEventListener(
      "rb-spark-cleanup",
      () => {
        hide();
        tip.remove();
      },
      { once: true }
    );
  }

  function cleanupSparkTips() {
    document.querySelectorAll("[data-spark-id]").forEach((el) => {
      el.dispatchEvent(new Event("rb-spark-cleanup"));
    });
    document.querySelectorAll("body > .stats-kpi-tip").forEach((el) => el.remove());
  }

  function renderKpis(data) {
    cleanupSparkTips();
    const series = buildTrendSeries(data.sessions || []);
    const blue = cssVar("--profile-blue", "#2563eb");
    const ink = cssVar("--text-primary", "#000c14");
    const teal = "#0d9488";
    const amber = "#d97706";
    const visPath = linePath(series.map((b) => b.visitors), 280, 72, 0);
    const engPath = linePath(series.map((b) => b.rate), 280, 72, 0);
    const sessPath = linePath(series.map((b) => b.sessions), 280, 72, 0);
    const goalPath = linePath(series.map((b) => b.goalRate), 280, 72, 0);
    const k = data.kpis;
    const returningPct =
      k.visitors > 0 ? Math.round((k.returning / k.visitors) * 100) : 0;

    els.kpis.innerHTML = `
      <article class="stats-kpi stats-glass">
        <p class="stats-kpi-label">Visitors</p>
        <p class="stats-kpi-value">${k.visitors}</p>
        <p class="stats-kpi-sub">${returningPct}% returning · ${k.visitors - k.returning} new</p>
        ${sparkSvg("kpi-vis", visPath, teal, 1)}
      </article>
      <article class="stats-kpi stats-glass">
        <p class="stats-kpi-label">Engagement</p>
        <p class="stats-kpi-value">${k.engagementRate}%</p>
        <p class="stats-kpi-sub">${k.bounceRate}% bounce · ${k.pagesPerSession} pages</p>
        ${sparkSvg("kpi-eng", engPath, blue, 1)}
      </article>
      <article class="stats-kpi stats-glass">
        <p class="stats-kpi-label">Sessions</p>
        <p class="stats-kpi-value">${k.sessions}</p>
        <p class="stats-kpi-sub">Avg ${fmtDuration(k.avgSessionMs)}${
          k.bots ? ` · ${k.bots} bot${k.bots === 1 ? "" : "s"} filtered` : ""
        }</p>
        ${sparkSvg("kpi-sess", sessPath, ink, 0.55)}
      </article>
      <article class="stats-kpi stats-glass">
        <p class="stats-kpi-label">Goal rate</p>
        <p class="stats-kpi-value">${k.goalRate}%</p>
        <p class="stats-kpi-sub">${k.deepReads} deep reads · ${k.contacts} contacts</p>
        ${sparkSvg("kpi-goal", goalPath, amber, 1)}
      </article>`;

    bindSparkTooltip(els.kpis.querySelector('[data-spark-id="kpi-vis"]'), series, visPath, "visitors");
    bindSparkTooltip(els.kpis.querySelector('[data-spark-id="kpi-eng"]'), series, engPath, "engagement");
    bindSparkTooltip(els.kpis.querySelector('[data-spark-id="kpi-sess"]'), series, sessPath, "sessions");
    bindSparkTooltip(els.kpis.querySelector('[data-spark-id="kpi-goal"]'), series, goalPath, "goals");
  }

  function padSlots(nodes) {
    const list = nodes.slice(0, SLOTS);
    while (list.length < SLOTS) {
      list.push({ id: "empty:" + list.length + ":" + Math.random().toString(36).slice(2, 6), empty: true });
    }
    return list;
  }

  function buildFlowModel(sessions) {
    const sourceMap = new Map();
    sessions.forEach((s) => {
      const key = s.referrerHost || "(direct)";
      if (!sourceMap.has(key)) {
        sourceMap.set(key, { id: "src:" + key, label: key, host: key, count: 0, kind: "source" });
      }
      sourceMap.get(key).count += 1;
    });

    const pageCols = [];
    for (let step = 0; step < STEPS; step++) {
      const map = new Map();
      sessions.forEach((s) => {
        const path = s.pathKeys || [];
        if (!path[step]) return;
        const key = path[step];
        const id = "p" + step + ":" + key;
        if (!map.has(id)) {
          const vis = pageVisual(key);
          map.set(id, {
            id,
            label: vis.label,
            pathKey: key,
            image: vis.image,
            tint: vis.tint || "#94a3b8",
            step,
            count: 0,
            exits: 0,
            kind: "page",
          });
        }
        map.get(id).count += 1;
        if (path.length === step + 1) map.get(id).exits += 1;
      });
      pageCols.push([...map.values()].sort((a, b) => b.count - a.count));
    }

    const exitNodes = [];
    for (let step = 0; step < STEPS; step++) {
      const exits = pageCols[step].reduce((a, n) => a + n.exits, 0);
      exitNodes.push({
        id: "exit:" + step,
        label: "Drop-off",
        count: exits,
        kind: "exit",
        step,
        empty: exits === 0,
      });
    }

    const columns = [
      {
        title: "Source",
        nodes: padSlots([...sourceMap.values()].sort((a, b) => b.count - a.count)),
      },
      ...pageCols.map((nodes, i) => ({
        title: i === 0 ? "1st" : i === 1 ? "2nd" : "3rd",
        nodes: padSlots(nodes),
      })),
      {
        title: "Exit",
        nodes: padSlots(exitNodes.filter((n) => !n.empty).concat(exitNodes.filter((n) => n.empty))),
      },
    ];

    const linkMap = new Map();
    function addLink(from, to, exit) {
      const key = from + "→" + to;
      if (!linkMap.has(key)) linkMap.set(key, { from, to, exit: Boolean(exit), count: 0 });
      linkMap.get(key).count += 1;
    }

    sessions.forEach((s) => {
      const src = "src:" + (s.referrerHost || "(direct)");
      const path = s.pathKeys || [];
      if (path[0]) addLink(src, "p0:" + path[0], false);
      for (let i = 0; i < path.length - 1 && i < STEPS - 1; i++) {
        addLink("p" + i + ":" + path[i], "p" + (i + 1) + ":" + path[i + 1], false);
      }
      if (path.length) {
        const lastStep = Math.min(path.length - 1, STEPS - 1);
        addLink("p" + lastStep + ":" + path[lastStep], "exit:" + lastStep, true);
      }
    });

    return { columns, links: [...linkMap.values()] };
  }

  function nodeMediaHTML(n) {
    if (n.kind === "source") {
      return `<span class="flow-node-media">${sourceMedia(n.host || n.label)}</span>`;
    }
    if (n.kind === "exit") {
      return `<span class="flow-node-media">${exitIcon()}</span>`;
    }
    // Page nodes: frosted tint only (no image)
    return "";
  }

  function renderFlow(sessions) {
    flowModel = buildFlowModel(sessions);
    const maxCount = Math.max(
      ...flowModel.columns.flatMap((c) => c.nodes.filter((n) => !n.empty).map((n) => n.count)),
      1
    );

    els.flowColumns.innerHTML = flowModel.columns
      .map((col) => {
        return `
        <div class="flow-col">
          <div class="flow-col-head"><p class="flow-col-title">${col.title}</p></div>
          <div class="flow-nodes">
            ${col.nodes
              .map((n) => {
                if (n.empty) {
                  return `<div class="flow-node is-empty" data-node-id="${n.id}" aria-hidden="true"></div>`;
                }
                const grow = Math.max(1, Math.round((n.count / maxCount) * 4));
                const kindClass =
                  n.kind === "exit"
                    ? " flow-node--exit"
                    : n.kind === "source"
                      ? " flow-node--source"
                      : " flow-node--page";
                const media = nodeMediaHTML(n);
                const tintStyle =
                  n.kind === "page" ? `--page-tint:${n.tint || "#94a3b8"};` : "";
                return `
                <button type="button"
                  class="flow-node${kindClass}${n.id === activeNodeId ? " is-active" : ""}"
                  data-node-id="${n.id}"
                  style="flex-grow:${grow};${tintStyle}"
                  title="${n.label}"
                  aria-label="${n.label}, ${n.count}">
                  ${media}
                  <span class="flow-node-body">
                    <span class="flow-node-count">${n.count}</span>
                    <span class="flow-node-label">${n.label}</span>
                  </span>
                </button>`;
              })
              .join("")}
          </div>
        </div>`;
      })
      .join("");

    els.flowColumns.querySelectorAll("button[data-node-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        showDetail(btn.getAttribute("data-node-id"));
      });
    });

    requestAnimationFrame(drawRibbons);
  }

  function nodeBox(el, stage) {
    const er = el.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    return {
      left: er.left - sr.left,
      top: er.top - sr.top,
      width: er.width,
      height: er.height,
    };
  }

  function drawRibbons() {
    if (!flowModel || !els.flowStage) return;
    const stage = els.flowStage;
    const w = Math.max(stage.clientWidth, stage.offsetWidth, 1);
    const h = Math.max(stage.clientHeight, stage.offsetHeight, 420);
    els.flowRibbons.setAttribute("width", w);
    els.flowRibbons.setAttribute("height", h);
    els.flowRibbons.setAttribute("viewBox", `0 0 ${w} ${h}`);

    const nodeEls = new Map();
    stage.querySelectorAll("[data-node-id]").forEach((el) => {
      if (el.classList.contains("is-empty")) return;
      nodeEls.set(el.getAttribute("data-node-id"), el);
    });

    const maxLink = Math.max(...flowModel.links.map((l) => l.count), 1);
    const blue = cssVar("--profile-blue", "#2563eb");
    const ink = cssVar("--text-primary", "#000c14");

    const paths = flowModel.links
      .map((link) => {
        const a = nodeEls.get(link.from);
        const b = nodeEls.get(link.to);
        if (!a || !b) return null;
        const ar = nodeBox(a, stage);
        const br = nodeBox(b, stage);
        const x1 = ar.left + ar.width;
        const y1 = ar.top + ar.height / 2;
        const x2 = br.left;
        const y2 = br.top + br.height / 2;
        const thickness = Math.max(3, (link.count / maxLink) * 26);
        const cx = (x1 + x2) / 2;
        const d = `M ${x1} ${y1 - thickness / 2} C ${cx} ${y1 - thickness / 2}, ${cx} ${y2 - thickness / 2}, ${x2} ${y2 - thickness / 2} L ${x2} ${y2 + thickness / 2} C ${cx} ${y2 + thickness / 2}, ${cx} ${y1 + thickness / 2}, ${x1} ${y1 + thickness / 2} Z`;
        return {
          d,
          from: link.from,
          to: link.to,
          fill: link.exit ? ink : blue,
          opacity: 0.12 + (link.count / maxLink) * 0.28,
        };
      })
      .filter(Boolean);

    els.flowRibbons.innerHTML = paths
      .map(
        (p) =>
          `<path class="flow-ribbon" data-from="${p.from}" data-to="${p.to}" d="${p.d}" style="fill:${p.fill};fill-opacity:${p.opacity.toFixed(2)}" />`
      )
      .join("");

    stage.querySelectorAll("button.flow-node").forEach((node) => {
      node.onmouseenter = () => {
        const id = node.getAttribute("data-node-id");
        node.classList.add("is-hot");
        els.flowRibbons.querySelectorAll(".flow-ribbon").forEach((r) => {
          const hot = r.getAttribute("data-from") === id || r.getAttribute("data-to") === id;
          r.style.opacity = hot ? "1" : "0.15";
        });
      };
      node.onmouseleave = () => {
        node.classList.remove("is-hot");
        els.flowRibbons.querySelectorAll(".flow-ribbon").forEach((r) => {
          r.style.opacity = "";
        });
      };
    });
  }

  function renderBars(container, rows, kind) {
    if (!rows.length) {
      container.innerHTML = `<div class="stats-empty">No data</div>`;
      return;
    }
    const max = Math.max(...rows.map((r) => r.value), 1);
    container.innerHTML = rows
      .slice(0, 5)
      .map((r, i) => {
        const pct = Math.round((r.value / max) * 100);
        const media =
          kind === "source"
            ? sourceMedia(r.host)
            : `<img src="${r.image}" alt="" loading="lazy" />`;
        return `
        <div class="bar-row${kind === "page" ? " bar-row--page" : ""}" title="${r.label}">
          <div class="bar-thumb">${media}</div>
          <div class="bar-track-wrap">
            <div class="bar-track"><span style="width:${pct}%;animation-delay:${0.04 * i}s"></span></div>
            <div class="bar-meta">
              ${kind === "page" ? `<span class="bar-name">${r.label}</span>` : ""}
              <span>${r.value}${r.extra || ""}</span>
            </div>
          </div>
        </div>`;
      })
      .join("");
  }

  function sessionsForNode(nodeId) {
    if (!nodeId) return filteredSessions;
    if (nodeId.startsWith("src:")) {
      const host = nodeId.slice(4);
      return filteredSessions.filter((s) => (s.referrerHost || "(direct)") === host);
    }
    if (nodeId.startsWith("exit:")) {
      const step = Number(nodeId.slice(5));
      return filteredSessions.filter((s) => (s.pathKeys || []).length === step + 1);
    }
    const m = /^p(\d+):(.+)$/.exec(nodeId);
    if (!m) return filteredSessions;
    const step = Number(m[1]);
    const pathKey = m[2];
    return filteredSessions.filter((s) => (s.pathKeys || [])[step] === pathKey);
  }

  function renderSessions(list) {
    if (!list.length) {
      els.sessions.innerHTML = `<div class="stats-empty">No matching sessions.</div>`;
      return;
    }
    els.sessions.innerHTML = list
      .slice(0, 40)
      .map((s) => {
        const thumbs = (s.pathKeys || [])
          .slice(0, 4)
          .map((p) => {
            const vis = pageVisual(p);
            return `<span><img src="${vis.image}" alt="" /></span>`;
          })
          .join("");
        return `
        <button type="button" class="session-item${s.id === activeId ? " is-active" : ""}" data-session-id="${s.id}" aria-label="${s.path.join(" to ")}">
          <div class="session-item-top">
            <div class="session-item-thumbs">${thumbs}<span>${sourceMedia(s.referrerHost)}</span></div>
            <div class="session-item-meta">${fmtDuration(s.durationMs)}</div>
          </div>
          <p class="session-item-sub">${fmtTime(s.startedAt)} · ${s.device}</p>
        </button>`;
      })
      .join("");

    els.sessions.querySelectorAll("[data-session-id]").forEach((btn) => {
      btn.addEventListener("click", () => openSession(btn.getAttribute("data-session-id")));
    });
  }

  function eventTitle(ev) {
    switch (ev.type) {
      case "page_view":
        return pageVisual(ev.path).label;
      case "scroll":
        return (ev.meta && ev.meta.scrollDepth != null ? ev.meta.scrollDepth + "%" : "Scroll");
      case "click":
        return "Click";
      case "exit":
        return "Left";
      default:
        return ev.type;
    }
  }

  function renderDetail(payload) {
    const s = payload.session;
    // Page-visit string only — skip scroll/heartbeat noise
    const events = (payload.events || []).filter(
      (e) => e.type === "page_view" || e.type === "exit"
    );
    els.detail.classList.remove("is-empty");
    els.detail.innerHTML = `
      <div class="session-detail-head">
        <h3>Page visits</h3>
        <p>${fmtTime(s.started_at || s.startedAt)} · ${s.device || "—"}</p>
      </div>
      <div class="timeline">
        ${events
          .map((ev) => {
            const vis = pageVisual(ev.path);
            const media =
              ev.type === "exit"
                ? exitIcon()
                : `<img src="${vis.image}" alt="" />`;
            return `
            <div class="timeline-item" data-type="${ev.type}">
              <span class="timeline-media">${media}</span>
              <div class="timeline-body">
                <h4>${eventTitle(ev)}</h4>
                <p>${fmtTime(ev.ts)}</p>
              </div>
            </div>`;
          })
          .join("")}
      </div>`;
  }

  async function openSession(id) {
    activeId = id;
    renderSessions(sessionsForNode(activeNodeId));
    els.detail.innerHTML = `<div class="stats-empty">Loading…</div>`;
    try {
      const payload = useDemo
        ? window.RB_STATS_DEMO_SESSION(id, overview)
        : await api("/admin/session/" + encodeURIComponent(id));
      if (!payload) throw new Error("missing");
      renderDetail(payload);
    } catch (_) {
      els.detail.innerHTML = `<div class="stats-empty">Couldn’t load session.</div>`;
    }
  }

  function showDetail(nodeId) {
    activeNodeId = nodeId;
    const list = sessionsForNode(nodeId);
    const btn = els.flowStage.querySelector(`button[data-node-id="${nodeId.replace(/"/g, '\\"')}"]`);
    els.detailKicker.textContent = list.length + " sessions";
    els.detailTitle.textContent = btn
      ? (btn.getAttribute("aria-label") || "Matching visits").replace(/,\s*\d+$/, "")
      : "Matching visits";

    els.flowView.hidden = true;
    els.flowDetail.hidden = false;
    els.flowPanel?.classList.add("is-detail");

    activeId = null;
    renderSessions(list);
    els.detail.classList.add("is-empty");
    els.detail.innerHTML = `<p>Select a session</p>`;
    if (list[0]) openSession(list[0].id);
  }

  function showFlow() {
    const wasDetail = activeNodeId;
    activeNodeId = null;
    activeId = null;
    els.flowDetail.hidden = true;
    els.flowView.hidden = false;
    els.flowPanel?.classList.remove("is-detail");
    if (wasDetail) renderFlow(filteredSessions);
    else requestAnimationFrame(drawRibbons);
  }

  function paint() {
    if (!overview) return;
    filteredSessions = (overview.sessions || []).filter(
      (s) => s.startedAt >= rangeStart && s.startedAt <= rangeEnd
    );
    const list = filteredSessions;
    const engaged = list.filter((s) => s.engaged).length;
    const bounced = list.filter((s) => s.bounced).length;
    const goals = list.filter((s) => s.goal).length;
    const deepReads = list.filter((s) => s.deepRead).length;
    const contacts = list.filter((s) => s.contact).length;
    const visitorMap = new Map();
    list.forEach((s) => {
      const id = s.visitorId || s.id;
      visitorMap.set(id, (visitorMap.get(id) || 0) + 1);
    });
    const visitors = visitorMap.size;
    const returning = [...visitorMap.values()].filter((n) => n > 1).length;
    const kpis = {
      sessions: list.length,
      visitors,
      returning,
      engagementRate: list.length ? Math.round((engaged / list.length) * 100) : 0,
      bounceRate: list.length ? Math.round((bounced / list.length) * 100) : 0,
      avgSessionMs: list.length
        ? Math.round(list.reduce((a, s) => a + s.durationMs, 0) / list.length)
        : 0,
      pagesPerSession: list.length
        ? Math.round((list.reduce((a, s) => a + s.pathKeys.length, 0) / list.length) * 10) / 10
        : 0,
      goalRate: list.length ? Math.round((goals / list.length) * 100) : 0,
      goals,
      deepReads,
      contacts,
    };

    els.meta.textContent = `${rangeLabel()} · ${list.length} sessions`;
    renderKpis({ sessions: list, kpis });
    renderFlow(list);
    if (els.flowDetail && !els.flowDetail.hidden && activeNodeId) {
      showDetail(activeNodeId);
    } else {
      els.flowDetail.hidden = true;
      els.flowView.hidden = false;
      els.flowPanel?.classList.remove("is-detail");
    }

    const pageCounts = new Map();
    list.forEach((s) => {
      (s.pathKeys || []).forEach((p) => {
        pageCounts.set(p, (pageCounts.get(p) || 0) + 1);
      });
    });
    const pageRows = [...pageCounts.entries()]
      .map(([path, value]) => {
        const vis = pageVisual(path);
        return { label: vis.label, image: vis.image, value, extra: "" };
      })
      .sort((a, b) => b.value - a.value);
    renderBars(els.pages, pageRows, "page");

    const sourceCounts = new Map();
    list.forEach((s) => {
      const host = s.referrerHost || "(direct)";
      sourceCounts.set(host, (sourceCounts.get(host) || 0) + 1);
    });
    const sourceRows = [...sourceCounts.entries()]
      .map(([host, value]) => ({ label: host, host, value, extra: "" }))
      .sort((a, b) => b.value - a.value);
    renderBars(els.referrers, sourceRows, "source");
    renderGeo(overview);
    renderIpLog(overview.ipLog || []);
  }

  function renderGeo(data) {
    const points = (data.geoPoints || []).filter(
      (p) =>
        p &&
        Number.isFinite(Number(p.lat)) &&
        Number.isFinite(Number(p.lon)) &&
        Number(p.lat) >= -90 &&
        Number(p.lat) <= 90
    );
    if (els.geoMap) {
      if (!points.length) {
        els.geoMap.innerHTML = `<p class="stats-empty">No mapped locations yet. New sessions after geo migration will appear here.</p>`;
      } else {
        const dots = points
          .map((p) => {
            const x = ((Number(p.lon) + 180) / 360) * 100;
            const y = ((90 - Number(p.lat)) / 180) * 50;
            const title = escapeHtml(placeLabel(p));
            return `<circle class="geo-dot" cx="${x.toFixed(2)}" cy="${y.toFixed(
              2
            )}" r="1.15"><title>${title}</title></circle>`;
          })
          .join("");
        els.geoMap.innerHTML = `<svg class="geo-map-svg" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <rect class="geo-ocean" x="0" y="0" width="100" height="50" rx="1.2"/>
          <g class="geo-grid" stroke-width="0.08">
            <line x1="0" y1="12.5" x2="100" y2="12.5"/>
            <line x1="0" y1="25" x2="100" y2="25"/>
            <line x1="0" y1="37.5" x2="100" y2="37.5"/>
            <line x1="25" y1="0" x2="25" y2="50"/>
            <line x1="50" y1="0" x2="50" y2="50"/>
            <line x1="75" y1="0" x2="75" y2="50"/>
          </g>
          ${dots}
        </svg>`;
      }
    }

    let countries = data.countries || [];
    if (!countries.length && points.length) {
      const m = new Map();
      points.forEach((p) => {
        const c = String(p.country || "XX").toUpperCase();
        m.set(c, (m.get(c) || 0) + 1);
      });
      countries = [...m.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((a, b) => b.count - a.count);
    }
    const rows = countries.map((c) => ({
      label: countryLabel(c.code),
      host: c.code,
      value: c.count,
      extra: c.code,
    }));
    renderBars(els.countries, rows, "source");
  }

  function renderIpLog(rows) {
    if (!els.ips) return;
    const inRange = rows.filter((r) => r.ts >= rangeStart && r.ts <= rangeEnd);
    if (!inRange.length) {
      els.ips.innerHTML = `<p class="stats-empty">No IP visits in this range.</p>`;
      return;
    }
    els.ips.innerHTML =
      `<div class="ip-log-head"><span>IP</span><span>Where</span><span>When</span><span>Visits</span></div>` +
      inRange
        .map((r) => {
          const n = r.visitN != null ? r.visitN : r.visit_n;
          const bot = r.isBot ? `<span class="ip-log-bot">Bot</span>` : "";
          return `<div class="ip-log-row${r.isBot ? " is-bot" : ""}">
            <code class="ip-log-ip">${escapeHtml(r.ip || "")}${bot}</code>
            <span class="ip-log-where" title="${escapeHtml(placeLabel(r))}">${escapeHtml(
            placeLabel(r)
          )}</span>
            <span class="ip-log-when">${fmtTime(r.ts)}</span>
            <span class="ip-log-n">${n}</span>
          </div>`;
        })
        .join("");
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showLocked() {
    els.app.hidden = true;
    els.locked.hidden = false;
  }

  function showApp() {
    els.locked.hidden = true;
    els.app.hidden = false;
  }

  async function load() {
    if (!password() && !forceDemo) {
      showLocked();
      return;
    }
    if (forceDemo && !password()) sessionStorage.setItem(PASS_KEY, "demo");

    showApp();
    els.status.textContent = useDemo ? "Demo" : "Live";

    try {
      if (useDemo) {
        if (typeof window.RB_STATS_DEMO !== "function") {
          throw new Error("Demo data missing");
        }
        overview = window.RB_STATS_DEMO();
      } else {
        overview = await api("/admin/overview?days=365");
      }
      paint();
    } catch (err) {
      if (String(err.message) === "unauthorized") {
        sessionStorage.removeItem(PASS_KEY);
        showLocked();
        return;
      }
      // Soft fallback so the UI still works if the worker is down
      if (!useDemo && typeof window.RB_STATS_DEMO === "function") {
        overview = window.RB_STATS_DEMO();
        els.status.textContent = "Offline · demo";
        paint();
        return;
      }
      els.status.textContent = "Error";
      if (els.flowColumns) {
        els.flowColumns.innerHTML =
          `<div class="stats-empty">Couldn’t load stats${
            err && err.message ? " — " + String(err.message).slice(0, 120) : ""
          }.</div>`;
      }
    }
  }

  function setPresetActive(preset) {
    els.range?.querySelectorAll("[data-preset]").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-preset") === String(preset));
    });
  }

  function closeRangePanel() {
    const panel = document.querySelector("[data-range-panel]");
    const toggle = document.querySelector("[data-range-toggle]");
    if (panel) panel.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  function openRangePanel() {
    const panel = document.querySelector("[data-range-panel]");
    const toggle = document.querySelector("[data-range-toggle]");
    const from = document.querySelector("[data-range-from]");
    const to = document.querySelector("[data-range-to]");
    if (from) from.value = toInputDate(rangeStart);
    if (to) to.value = toInputDate(rangeEnd);
    if (panel) panel.hidden = false;
    if (toggle) toggle.setAttribute("aria-expanded", "true");
  }

  els.range?.querySelectorAll("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = btn.getAttribute("data-preset");
      if (preset === "custom") {
        openRangePanel();
        return;
      }
      closeRangePanel();
      applyPreset(preset);
      setPresetActive(preset);
      paint();
    });
  });

  document.querySelector("[data-range-apply]")?.addEventListener("click", () => {
    const fromEl = document.querySelector("[data-range-from]");
    const toEl = document.querySelector("[data-range-to]");
    if (!fromEl?.value || !toEl?.value) return;
    let start = startOfDay(new Date(fromEl.value + "T00:00:00").getTime());
    let end = endOfDay(new Date(toEl.value + "T00:00:00").getTime());
    if (end < start) {
      const tmp = start;
      start = startOfDay(end);
      end = endOfDay(tmp);
    }
    rangePreset = "custom";
    rangeStart = start;
    rangeEnd = end;
    setPresetActive("custom");
    closeRangePanel();
    paint();
  });

  document.addEventListener("pointerdown", (e) => {
    const panel = document.querySelector("[data-range-panel]");
    if (!panel || panel.hidden) return;
    if (els.range && !els.range.contains(e.target)) closeRangePanel();
  });

  document.querySelector("[data-flow-back]")?.addEventListener("click", showFlow);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && els.flowDetail && !els.flowDetail.hidden) showFlow();
  });

  window.addEventListener("resize", () => {
    clearTimeout(window.__rbFlowResize);
    window.__rbFlowResize = setTimeout(drawRibbons, 120);
  });

  document.querySelector("[data-stats-unlock]")?.addEventListener("click", () => {
    sessionStorage.removeItem(PASS_KEY);
    window.dispatchEvent(new CustomEvent("rb-open-stats-gate"));
  });

  load();
})();
