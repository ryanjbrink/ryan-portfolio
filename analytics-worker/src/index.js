/**
 * Portfolio analytics API — Cloudflare Worker + D1 (free tier).
 *
 * POST /collect          public — ingest session events
 * GET  /admin/overview   auth  — KPIs + journey aggregate + session list
 * GET  /admin/session/:id auth — one session timeline
 * POST /admin/auth       auth  — password check
 */

const PAGE_LABELS = {
  "/": "Home",
  "/index.html": "Home",
  "/current-role.html": "Current role",
  "/fordscan.html": "Ford",
  "/landstarresearch.html": "Landstar",
  "/simplevariables.html": "Variables",
  "/phoney.html": "Phoney",
  "/solaire.html": "Solaire",
  "/stats.html": "Stats",
};

function corsHeaders(origin, allowed) {
  const list = (allowed || "").split(",").map((s) => s.trim()).filter(Boolean);
  const isLocal =
    origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && (list.includes(origin) || isLocal)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else if (!origin) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (list[0]) {
    // Echo a configured origin so misconfigured local hosts still get a clear CORS error
    headers["Access-Control-Allow-Origin"] = list[0];
  } else {
    headers["Access-Control-Allow-Origin"] = "*";
  }
  return headers;
}

async function readBodyJson(request) {
  const text = await request.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function normalizePath(path) {
  if (!path) return "/";
  try {
    if (path.startsWith("http")) path = new URL(path).pathname;
  } catch (_) {}
  path = path.split("?")[0].split("#")[0] || "/";
  if (path.endsWith("/index.html")) path = "/";
  if (path === "/index.html") path = "/";
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path || "/";
}

function labelFor(path) {
  const p = normalizePath(path);
  return PAGE_LABELS[p] || PAGE_LABELS["/" + p.replace(/^\//, "")] || p;
}

function authed(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(env.ADMIN_PASSWORD && token && token === env.ADMIN_PASSWORD);
}

function parseMeta(raw) {
  if (!raw) return {};
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (_) {
    return {};
  }
}

function clientIp(request) {
  const cf = request.headers.get("CF-Connecting-IP");
  if (cf) return cf.trim();
  const trueClient = request.headers.get("True-Client-IP");
  if (trueClient) return trueClient.trim();
  const xff = request.headers.get("X-Forwarded-For");
  if (xff) return xff.split(",")[0].trim();
  return "";
}

function isExcludedIp(request, env) {
  const ip = clientIp(request).toLowerCase();
  if (!ip) return false;
  const list = String(env.EXCLUDED_IPS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(ip);
}

async function recordIpVisit(env, ip, sessionId, ts) {
  const safeIp = String(ip || "").slice(0, 64);
  if (!safeIp) return;
  try {
    await env.DB.prepare(
      `INSERT INTO ip_visitors (ip, first_seen, last_seen, visits)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(ip) DO UPDATE SET
         last_seen = excluded.last_seen,
         visits = ip_visitors.visits + 1`
    )
      .bind(safeIp, ts, ts)
      .run();
    const row = await env.DB.prepare(`SELECT visits FROM ip_visitors WHERE ip = ?`)
      .bind(safeIp)
      .first();
    const visitN = Number(row && row.visits) || 1;
    await env.DB.prepare(
      `INSERT INTO ip_visit_log (ip, ts, visit_n, session_id) VALUES (?, ?, ?, ?)`
    )
      .bind(safeIp, ts, visitN, sessionId)
      .run();
  } catch (_) {
    // Table may not exist yet on older deploys — ignore until migrated
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request.headers.get("Origin"), env.ALLOWED_ORIGINS);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (request.method === "POST" && path === "/collect") {
        return await handleCollect(request, env, cors);
      }
      if (request.method === "POST" && path === "/admin/auth") {
        return await handleAuth(request, env, cors);
      }
      if (request.method === "GET" && path === "/admin/overview") {
        if (!authed(request, env)) return json({ error: "unauthorized" }, 401, cors);
        return await handleOverview(url, env, cors);
      }
      if (request.method === "GET" && path.startsWith("/admin/session/")) {
        if (!authed(request, env)) return json({ error: "unauthorized" }, 401, cors);
        const id = decodeURIComponent(path.slice("/admin/session/".length));
        return await handleSession(id, env, cors);
      }
      return json({ ok: true, service: "ryan-portfolio-analytics" }, 200, cors);
    } catch (err) {
      return json({ error: String(err && err.message ? err.message : err) }, 500, cors);
    }
  },
};

async function handleAuth(request, env, cors) {
  const body = (await readBodyJson(request)) || {};
  const ok = Boolean(env.ADMIN_PASSWORD && body.password === env.ADMIN_PASSWORD);
  return json({ ok }, ok ? 200 : 401, cors);
}

async function handleCollect(request, env, cors) {
  // Drop owner / test traffic by public IP (never stored)
  if (isExcludedIp(request, env)) {
    return json({ ok: true, skipped: "excluded_ip" }, 200, cors);
  }

  // Accept application/json or text/plain (beacon-safe) JSON bodies
  const body = await readBodyJson(request);
  if (!body || !body.sessionId || !Array.isArray(body.events) || !body.events.length) {
    return json({ error: "invalid payload" }, 400, cors);
  }

  const sessionId = String(body.sessionId).slice(0, 64);
  const visitorId = String(body.visitorId || sessionId).slice(0, 64);
  const now = Date.now();
  const startedAt = Number(body.startedAt) || now;
  const device = String(body.device || "unknown").slice(0, 32);
  const referrer = String(body.referrer || "").slice(0, 500);
  const landing = normalizePath(body.landingPath || body.events[0]?.path || "/");
  const utm = body.utm || {};
  const ip = clientIp(request);

  // Only count IP visits on first collect for a session (not heartbeats)
  let isNewSession = false;
  try {
    const existing = await env.DB.prepare(`SELECT id FROM sessions WHERE id = ?`)
      .bind(sessionId)
      .first();
    isNewSession = !existing;
  } catch (_) {
    isNewSession = true;
  }

  // Prefer schema with visitor_id; fall back if column missing on older D1 DBs
  try {
    await env.DB.prepare(
      `INSERT INTO sessions (id, started_at, last_seen_at, referrer, landing_path, device, utm_source, utm_medium, utm_campaign, visitor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         last_seen_at = excluded.last_seen_at,
         visitor_id = COALESCE(sessions.visitor_id, excluded.visitor_id)`
    )
      .bind(
        sessionId,
        startedAt,
        now,
        referrer,
        landing,
        device,
        String(utm.source || "").slice(0, 80),
        String(utm.medium || "").slice(0, 80),
        String(utm.campaign || "").slice(0, 80),
        visitorId
      )
      .run();
  } catch (_) {
    await env.DB.prepare(
      `INSERT INTO sessions (id, started_at, last_seen_at, referrer, landing_path, device, utm_source, utm_medium, utm_campaign)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET last_seen_at = excluded.last_seen_at`
    )
      .bind(
        sessionId,
        startedAt,
        now,
        referrer,
        landing,
        device,
        String(utm.source || "").slice(0, 80),
        String(utm.medium || "").slice(0, 80),
        String(utm.campaign || "").slice(0, 80)
      )
      .run();
  }

  if (isNewSession) {
    await recordIpVisit(env, ip, sessionId, startedAt || now);
  }

  const stmts = [];
  for (const ev of body.events.slice(0, 40)) {
    const type = String(ev.type || "page_view").slice(0, 40);
    const ts = Number(ev.ts) || now;
    const p = normalizePath(ev.path || "/");
    const title = String(ev.title || "").slice(0, 160);
    const meta = JSON.stringify(ev.meta || {}).slice(0, 2000);
    stmts.push(
      env.DB.prepare(
        `INSERT INTO events (session_id, ts, type, path, title, meta) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(sessionId, ts, type, p, title, meta)
    );
  }
  if (stmts.length) await env.DB.batch(stmts);

  return json({ ok: true }, 200, cors);
}

function isContactHref(href) {
  const h = String(href || "").toLowerCase();
  return (
    h.startsWith("mailto:") ||
    h.startsWith("tel:") ||
    h.includes("linkedin.com") ||
    h.includes("github.com") ||
    /\.pdf(\?|#|$)/i.test(h)
  );
}

async function handleOverview(url, env, cors) {
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const fromParam = Number(url.searchParams.get("from"));
  const toParam = Number(url.searchParams.get("to"));
  const since =
    Number.isFinite(fromParam) && fromParam > 0
      ? fromParam
      : Date.now() - days * 24 * 60 * 60 * 1000;
  const until =
    Number.isFinite(toParam) && toParam > 0 ? toParam : Date.now() + 60_000;

  const sessions = (
    await env.DB.prepare(
      `SELECT * FROM sessions
       WHERE started_at >= ? AND started_at <= ?
       ORDER BY started_at DESC LIMIT 500`
    )
      .bind(since, until)
      .all()
  ).results;

  const sessionIds = sessions.map((s) => s.id);
  let events = [];
  if (sessionIds.length) {
    // D1 has bind limits; chunk if needed
    const chunks = [];
    for (let i = 0; i < sessionIds.length; i += 80) {
      const slice = sessionIds.slice(i, i + 80);
      const placeholders = slice.map(() => "?").join(",");
      const rows = (
        await env.DB.prepare(
          `SELECT session_id, ts, type, path, title, meta FROM events
           WHERE session_id IN (${placeholders})
           ORDER BY ts ASC`
        )
          .bind(...slice)
          .all()
      ).results;
      chunks.push(...rows);
    }
    events = chunks;
  }

  const bySession = new Map();
  for (const ev of events) {
    if (!bySession.has(ev.session_id)) bySession.set(ev.session_id, []);
    bySession.get(ev.session_id).push(ev);
  }

  const journeys = [];
  const transitionCounts = new Map();
  const pageStats = new Map();
  const referrerCounts = new Map();
  let engaged = 0;
  let bounced = 0;
  let goals = 0;
  let deepReads = 0;
  let contacts = 0;
  let totalDwell = 0;
  let dwellSamples = 0;
  const visitorSessions = new Map();

  for (const s of sessions) {
    const evs = bySession.get(s.id) || [];
    const pageViews = evs.filter((e) => e.type === "page_view");
    const pathSeq = [];
    for (const pv of pageViews) {
      const p = normalizePath(pv.path);
      if (!pathSeq.length || pathSeq[pathSeq.length - 1] !== p) pathSeq.push(p);
    }
    if (!pathSeq.length && s.landing_path) pathSeq.push(normalizePath(s.landing_path));

    let maxScroll = 0;
    let dwell = 0;
    let contact = false;
    for (const e of evs) {
      const meta = parseMeta(e.meta);
      if (typeof meta.scrollDepth === "number") maxScroll = Math.max(maxScroll, meta.scrollDepth);
      if (typeof meta.dwellMs === "number") dwell = Math.max(dwell, meta.dwellMs);
      if (e.type === "heartbeat" && typeof meta.dwellMs === "number") {
        dwell = Math.max(dwell, meta.dwellMs);
      }
      if (e.type === "click" && (meta.goal || meta.contact || isContactHref(meta.href))) {
        contact = true;
      }
      if (e.type === "page_view" || e.type === "scroll") {
        const key = normalizePath(e.path);
        if (!pageStats.has(key)) pageStats.set(key, { path: key, views: 0, scrolls: [], dwells: [] });
        const ps = pageStats.get(key);
        if (e.type === "page_view") ps.views += 1;
        if (typeof meta.scrollDepth === "number") ps.scrolls.push(meta.scrollDepth);
        if (typeof meta.dwellMs === "number") ps.dwells.push(meta.dwellMs);
      }
    }

    const duration =
      dwell ||
      (evs.length ? Math.max(0, (evs[evs.length - 1].ts || 0) - (evs[0].ts || s.started_at)) : 0);

    if (duration > 0) {
      totalDwell += duration;
      dwellSamples += 1;
    }

    const isEngaged = pathSeq.length > 1 || maxScroll >= 50 || duration >= 30000;
    const isBounce = pathSeq.length <= 1 && maxScroll < 25 && duration < 15000;
    const deepRead = maxScroll >= 75 || duration >= 90000;
    const isGoal = contact || deepRead;
    if (isEngaged) engaged += 1;
    if (isBounce) bounced += 1;
    if (isGoal) goals += 1;
    if (deepRead) deepReads += 1;
    if (contact) contacts += 1;

    const visitorKey = s.visitor_id || s.id;
    if (!visitorSessions.has(visitorKey)) visitorSessions.set(visitorKey, 0);
    visitorSessions.set(visitorKey, visitorSessions.get(visitorKey) + 1);

    for (let i = 0; i < pathSeq.length - 1; i++) {
      const key = `${pathSeq[i]}→${pathSeq[i + 1]}`;
      transitionCounts.set(key, (transitionCounts.get(key) || 0) + 1);
    }
    // Drop edge from last page
    if (pathSeq.length) {
      const dropKey = `${pathSeq[pathSeq.length - 1]}→__drop__`;
      transitionCounts.set(dropKey, (transitionCounts.get(dropKey) || 0) + 1);
    }

    const ref = s.referrer || "(direct)";
    let refHost = "(direct)";
    try {
      if (s.referrer) refHost = new URL(s.referrer).hostname || s.referrer;
    } catch (_) {
      refHost = s.referrer.slice(0, 80);
    }
    if (s.utm_source) refHost = s.utm_source;
    referrerCounts.set(refHost, (referrerCounts.get(refHost) || 0) + 1);

    journeys.push({
      id: s.id,
      visitorId: s.visitor_id || s.id,
      startedAt: s.started_at,
      lastSeenAt: s.last_seen_at,
      device: s.device,
      referrer: ref,
      referrerHost: refHost,
      landing: labelFor(s.landing_path),
      path: pathSeq.map(labelFor),
      pathKeys: pathSeq,
      durationMs: duration,
      maxScroll,
      engaged: isEngaged,
      bounced: isBounce,
      goal: isGoal,
      deepRead,
      contact,
      eventCount: evs.length,
    });
  }

  const visitors = visitorSessions.size;
  const returning = [...visitorSessions.values()].filter((n) => n > 1).length;

  const transitions = [...transitionCounts.entries()]
    .map(([key, count]) => {
      const [from, to] = key.split("→");
      return {
        from,
        to,
        fromLabel: from === "__drop__" ? "Drop" : labelFor(from),
        toLabel: to === "__drop__" ? "Drop-off" : labelFor(to),
        count,
      };
    })
    .sort((a, b) => b.count - a.count);

  // Aggregate funnel: ordered unique paths by frequency of exact journeys
  const pathFreq = new Map();
  for (const j of journeys) {
    const key = j.pathKeys.join("→") || "(empty)";
    if (!pathFreq.has(key)) pathFreq.set(key, { pathKeys: j.pathKeys, path: j.path, count: 0 });
    pathFreq.get(key).count += 1;
  }
  const topJourneys = [...pathFreq.values()].sort((a, b) => b.count - a.count).slice(0, 12);

  const pages = [...pageStats.values()]
    .map((p) => ({
      path: p.path,
      label: labelFor(p.path),
      views: p.views,
      avgScroll: p.scrolls.length
        ? Math.round(p.scrolls.reduce((a, b) => a + b, 0) / p.scrolls.length)
        : 0,
      avgDwellMs: p.dwells.length
        ? Math.round(p.dwells.reduce((a, b) => a + b, 0) / p.dwells.length)
        : 0,
    }))
    .sort((a, b) => b.views - a.views);

  const referrers = [...referrerCounts.entries()]
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  let ipLog = [];
  let ipSummary = [];
  try {
    ipLog = (
      await env.DB.prepare(
        `SELECT ip, ts, visit_n, session_id
         FROM ip_visit_log
         WHERE ts >= ? AND ts <= ?
         ORDER BY ts DESC
         LIMIT 200`
      )
        .bind(since, until)
        .all()
    ).results.map((r) => ({
      ip: r.ip,
      ts: r.ts,
      visitN: r.visit_n,
      sessionId: r.session_id,
    }));
    ipSummary = (
      await env.DB.prepare(
        `SELECT ip, first_seen, last_seen, visits
         FROM ip_visitors
         ORDER BY visits DESC, last_seen DESC
         LIMIT 100`
      ).all()
    ).results.map((r) => ({
      ip: r.ip,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      visits: r.visits,
    }));
  } catch (_) {
    ipLog = [];
    ipSummary = [];
  }

  const total = sessions.length || 1;

  return json(
    {
      days,
      generatedAt: Date.now(),
      kpis: {
        sessions: sessions.length,
        visitors,
        returning,
        engagementRate: Math.round((engaged / total) * 100),
        bounceRate: Math.round((bounced / total) * 100),
        avgSessionMs: dwellSamples ? Math.round(totalDwell / dwellSamples) : 0,
        pagesPerSession: journeys.length
          ? Math.round(
              (journeys.reduce((a, j) => a + j.pathKeys.length, 0) / journeys.length) * 10
            ) / 10
          : 0,
        goalRate: Math.round((goals / total) * 100),
        goals,
        deepReads,
        contacts,
      },
      transitions,
      topJourneys,
      pages,
      referrers,
      sessions: journeys.slice(0, 100),
      ipLog,
      ipSummary,
    },
    200,
    cors
  );
}

async function handleSession(id, env, cors) {
  const session = await env.DB.prepare(`SELECT * FROM sessions WHERE id = ?`).bind(id).first();
  if (!session) return json({ error: "not found" }, 404, cors);

  const events = (
    await env.DB.prepare(
      `SELECT id, ts, type, path, title, meta FROM events WHERE session_id = ? ORDER BY ts ASC`
    )
      .bind(id)
      .all()
  ).results.map((e) => ({
    ...e,
    pathLabel: labelFor(e.path),
    meta: parseMeta(e.meta),
  }));

  return json({ session, events }, 200, cors);
}
