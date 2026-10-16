/** Seeded demo journeys so the stats UI works before the Worker is deployed. */
window.RB_STATS_DEMO = function buildDemo() {
  const now = Date.now();
  const day = 86400000;
  const paths = {
    home: "/",
    role: "/current-role.html",
    ford: "/fordscan.html",
    landstar: "/landstarresearch.html",
    variables: "/simplevariables.html",
    phoney: "/phoney.html",
    solaire: "/solaire.html",
  };

  const templates = [
    { path: [paths.home, paths.ford], duration: 95000, scroll: 80, ref: "linkedin.com", device: "desktop", contact: true },
    { path: [paths.home, paths.landstar, paths.variables], duration: 210000, scroll: 100, ref: "(direct)", device: "desktop" },
    { path: [paths.home], duration: 8000, scroll: 10, ref: "twitter.com", device: "mobile", bounce: true },
    { path: [paths.home, paths.role, paths.ford], duration: 180000, scroll: 75, ref: "google.com", device: "desktop" },
    { path: [paths.home, paths.phoney], duration: 62000, scroll: 55, ref: "(direct)", device: "mobile" },
    { path: [paths.home, paths.solaire], duration: 40000, scroll: 40, ref: "linkedin.com", device: "tablet" },
    { path: [paths.home, paths.landstar], duration: 120000, scroll: 90, ref: "(direct)", device: "desktop", contact: true },
    { path: [paths.home, paths.variables, paths.ford], duration: 150000, scroll: 70, ref: "newsletter", device: "desktop" },
    { path: [paths.ford], duration: 45000, scroll: 60, ref: "linkedin.com", device: "mobile" },
    { path: [paths.home, paths.role], duration: 88000, scroll: 65, ref: "(direct)", device: "desktop" },
    { path: [paths.home], duration: 12000, scroll: 15, ref: "google.com", device: "mobile", bounce: true },
    { path: [paths.home, paths.ford, paths.landstar], duration: 240000, scroll: 95, ref: "(direct)", device: "desktop", contact: true },
    { path: [paths.home, paths.landstar, paths.role], duration: 160000, scroll: 85, ref: "linkedin.com", device: "desktop" },
    { path: [paths.home, paths.variables], duration: 70000, scroll: 50, ref: "(direct)", device: "mobile" },
    { path: [paths.home, paths.phoney, paths.solaire], duration: 130000, scroll: 70, ref: "google.com", device: "desktop" },
    { path: [paths.home], duration: 6000, scroll: 5, ref: "twitter.com", device: "mobile", bounce: true },
    { path: [paths.home, paths.ford], duration: 110000, scroll: 88, ref: "(direct)", device: "desktop" },
    { path: [paths.home, paths.role, paths.landstar, paths.variables], duration: 280000, scroll: 100, ref: "newsletter", device: "desktop", contact: true },
  ];

  const labels = {
    "/": "Home",
    "/current-role.html": "Current role",
    "/fordscan.html": "Ford",
    "/landstarresearch.html": "Landstar",
    "/simplevariables.html": "Variables",
    "/phoney.html": "Phoney",
    "/solaire.html": "Solaire",
  };

  const label = (p) => labels[p] || p;

  // Spread sessions across ~90 days; reuse visitor ids so returning traffic exists
  const sessions = templates.map((t, i) => {
    const dayOffset = (i * 4.7) % 90;
    const startedAt = now - dayOffset * day - (i % 5) * 3600000;
    const engaged = !t.bounce && (t.path.length > 1 || t.scroll >= 50 || t.duration >= 30000);
    const deepRead = t.scroll >= 75 || t.duration >= 90000;
    const contact = Boolean(t.contact);
    return {
      id: "demo_" + (i + 1),
      visitorId: "demo_v_" + (i % 11),
      startedAt,
      lastSeenAt: startedAt + t.duration,
      device: t.device,
      referrer: t.ref === "(direct)" ? "" : "https://" + t.ref + "/",
      referrerHost: t.ref,
      landing: label(t.path[0]),
      path: t.path.map(label),
      pathKeys: t.path,
      durationMs: t.duration,
      maxScroll: t.scroll,
      engaged,
      bounced: Boolean(t.bounce),
      deepRead,
      contact,
      goal: deepRead || contact,
      eventCount: t.path.length * 3,
    };
  });

  for (let d = 0; d < 90; d++) {
    if (d % 3 !== 0) continue;
    const n = 1 + (d % 2);
    for (let j = 0; j < n; j++) {
      const bounce = d % 7 === 0;
      const path = bounce
        ? [paths.home]
        : d % 2 === 0
          ? [paths.home, paths.ford]
          : [paths.home, paths.landstar, paths.variables];
      const startedAt = now - d * day - j * 7200000;
      const duration = bounce ? 9000 : 60000 + d * 2000;
      const scroll = bounce ? 12 : 60 + (d % 40);
      const deepRead = !bounce && (scroll >= 75 || duration >= 90000);
      const contact = !bounce && d % 11 === 0;
      sessions.push({
        id: "demo_x_" + d + "_" + j,
        visitorId: "demo_v_" + ((d + j) % 17),
        startedAt,
        lastSeenAt: startedAt + duration,
        device: d % 2 ? "mobile" : "desktop",
        referrer: "",
        referrerHost: d % 5 === 0 ? "linkedin.com" : "(direct)",
        landing: label(path[0]),
        path: path.map(label),
        pathKeys: path,
        durationMs: duration,
        maxScroll: scroll,
        engaged: !bounce,
        bounced: bounce,
        deepRead,
        contact,
        goal: deepRead || contact,
        eventCount: path.length * 2,
      });
    }
  }

  sessions.sort((a, b) => b.startedAt - a.startedAt);

  const pageViews = new Map();
  sessions.forEach((s) => {
    s.pathKeys.forEach((p, idx) => {
      if (!pageViews.has(p)) pageViews.set(p, { path: p, label: label(p), views: 0, scrolls: [], dwells: [] });
      const row = pageViews.get(p);
      row.views += 1;
      row.scrolls.push(idx === s.pathKeys.length - 1 ? s.maxScroll : 70);
      row.dwells.push(Math.round(s.durationMs / Math.max(s.pathKeys.length, 1)));
    });
  });

  const pages = [...pageViews.values()]
    .map((p) => ({
      path: p.path,
      label: p.label,
      views: p.views,
      avgScroll: Math.round(p.scrolls.reduce((a, b) => a + b, 0) / p.scrolls.length),
      avgDwellMs: Math.round(p.dwells.reduce((a, b) => a + b, 0) / p.dwells.length),
    }))
    .sort((a, b) => b.views - a.views);

  const referrerCounts = new Map();
  sessions.forEach((s) => referrerCounts.set(s.referrerHost, (referrerCounts.get(s.referrerHost) || 0) + 1));

  const engaged = sessions.filter((s) => s.engaged).length;
  const bounced = sessions.filter((s) => s.bounced).length;
  const visitorMap = new Map();
  sessions.forEach((s) => visitorMap.set(s.visitorId, (visitorMap.get(s.visitorId) || 0) + 1));
  const visitors = visitorMap.size;
  const returning = [...visitorMap.values()].filter((n) => n > 1).length;
  const goals = sessions.filter((s) => s.goal).length;
  const deepReads = sessions.filter((s) => s.deepRead).length;
  const contacts = sessions.filter((s) => s.contact).length;

  return {
    days: 90,
    demo: true,
    generatedAt: now,
    kpis: {
      sessions: sessions.length,
      visitors,
      returning,
      engagementRate: Math.round((engaged / sessions.length) * 100),
      bounceRate: Math.round((bounced / sessions.length) * 100),
      avgSessionMs: Math.round(sessions.reduce((a, s) => a + s.durationMs, 0) / sessions.length),
      pagesPerSession:
        Math.round((sessions.reduce((a, s) => a + s.pathKeys.length, 0) / sessions.length) * 10) / 10,
      goalRate: Math.round((goals / sessions.length) * 100),
      goals,
      deepReads,
      contacts,
    },
    transitions: [],
    topJourneys: [],
    pages,
    referrers: [...referrerCounts.entries()]
      .map(([host, count]) => ({ host, count }))
      .sort((a, b) => b.count - a.count),
    sessions,
  };
};

window.RB_STATS_DEMO_SESSION = function (id, overview) {
  const s = (overview.sessions || []).find((x) => x.id === id);
  if (!s) return null;
  const events = [];
  let ts = s.startedAt;
  s.pathKeys.forEach((p, i) => {
    events.push({
      id: i * 3 + 1,
      ts,
      type: "page_view",
      path: p,
      pathLabel: s.path[i],
      title: s.path[i],
      meta: { dwellMs: 0, scrollDepth: 0 },
    });
    ts += Math.round(s.durationMs / (s.pathKeys.length * 2));
    events.push({
      id: i * 3 + 2,
      ts,
      type: "scroll",
      path: p,
      pathLabel: s.path[i],
      title: s.path[i],
      meta: { scrollDepth: i === s.pathKeys.length - 1 ? s.maxScroll : 50, dwellMs: ts - s.startedAt },
    });
    ts += Math.round(s.durationMs / (s.pathKeys.length * 2));
  });
  if (s.contact) {
    events.push({
      id: 90,
      ts: ts,
      type: "click",
      path: s.pathKeys[s.pathKeys.length - 1],
      pathLabel: s.path[s.path.length - 1],
      title: s.path[s.path.length - 1],
      meta: { href: "mailto:hello@example.com", goal: true, contact: true },
    });
  }
  events.push({
    id: 99,
    ts: s.lastSeenAt,
    type: "exit",
    path: s.pathKeys[s.pathKeys.length - 1],
    pathLabel: s.path[s.path.length - 1],
    title: s.path[s.path.length - 1],
    meta: { dwellMs: s.durationMs, scrollDepth: s.maxScroll },
  });
  return {
    session: {
      id: s.id,
      started_at: s.startedAt,
      last_seen_at: s.lastSeenAt,
      device: s.device,
      referrer: s.referrer,
      landing_path: s.pathKeys[0],
      visitor_id: s.visitorId,
    },
    events,
  };
};
