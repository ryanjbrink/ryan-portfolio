# Portfolio analytics (free)

Cloudflare **Workers + D1** — free tier is enough for a personal portfolio.

## One-time setup

1. Create a free [Cloudflare](https://dash.cloudflare.com/) account.
2. From this folder:

```bash
cd analytics-worker
npm install
npx wrangler login
npm run db:create
```

3. Copy the printed `database_id` into `wrangler.toml` (replace `REPLACE_WITH_D1_DATABASE_ID`).
4. Migrate + set password + deploy:

```bash
npm run db:migrate
npx wrangler secret put ADMIN_PASSWORD
npm run deploy
```

5. Paste the worker URL into `js/analytics-config.js`:

```js
window.RB_ANALYTICS = {
  endpoint: "https://ryan-portfolio-analytics.<your-subdomain>.workers.dev",
  demo: false,
};
```

6. Commit and push the site. Collect starts on every page that loads `site-analytics.js`. Open stats with **⌘E** / **Ctrl+E** (or long-press bottom-left on mobile) and enter the same admin password.

### IP visit log

Each **new session** (not heartbeats) appends a row with IP, timestamp, and that IP’s running visit count. View it on the stats page under **IP visits**. Your `EXCLUDED_IPS` never appear there.

### Exclude your own IPs

Edit `EXCLUDED_IPS` in `wrangler.toml` (comma-separated public IPs), then redeploy:

```bash
npm run deploy
```

Find an IP on a device at https://api.ipify.org (phone on cellular often differs from home Wi‑Fi).

### Checklist if data isn’t showing

| Symptom | Fix |
| --- | --- |
| Status pill says **Demo** | `endpoint` is empty — set it in `analytics-config.js` |
| Collect never hits Worker | Confirm endpoint URL, redeploy Worker, hard-refresh site |
| CORS errors in console | Add your site origin to `ALLOWED_ORIGINS` in `wrangler.toml`, then `npm run deploy` |
| Auth fails | `npx wrangler secret put ADMIN_PASSWORD` must match what you type |
| Old DB missing visitors | Run the `ALTER TABLE` below |

### Existing D1 database

If the DB was created before `visitor_id` existed:

```bash
npx wrangler d1 execute ryan-portfolio-analytics --remote --command "ALTER TABLE sessions ADD COLUMN visitor_id TEXT"
```

## Local preview (no Cloudflare yet)

Keep `endpoint: ""` and open `stats.html?demo=1`, or unlock with any password — the UI uses seeded journeys.

## Local Worker dev

```bash
cd analytics-worker
npm install
npm run db:migrate:local
npm run dev
```

Point `analytics-config.js` at the printed `http://127.0.0.1:8787` URL while testing.
