/* Visitor counter for kuangxh9.github.io: a Cloudflare Worker with a D1 database.

   POST /hit    {"p": "/about/"}   one page view, sent by navigator.sendBeacon
   GET  /stats                     aggregates only, cached 30 s at the edge, never in browsers

   What is kept: per day, per page and per country, a count of views; per day and
   per country, a count of distinct visitors. The country is Cloudflare's own
   request.cf.country. IP addresses are never written anywhere: a visitor is
   recognised within one day by a SHA-256 hash of (secret salt, date, IP, user
   agent), kept only to tell a repeat view from a new one, and deleted after a
   day by the scheduled clean-up. No cookies, no fingerprinting beyond that.

   Filtering: requests must come from the site's own origin; common bots and
   automation are ignored; a repeat view of the same page by the same visitor
   within ten minutes is not counted again; the page path must be one the site
   actually has. The client itself skips localhost, Do Not Track, Global Privacy
   Control, automated browsers, and visitors who opted out with ?notrack=1. */

const ORIGIN = 'https://kuangxh9.github.io';
const PAGES = new Set(['/', '/research/', '/cv/', '/about/', '/404.html']);
const BOT = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|curl|wget|python|httpclient|axios|node-fetch|go-http|java\/|monitor|uptime/i;
const REPEAT_MS = 10 * 60 * 1000;

const day = (offset = 0) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

async function hash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hit(req, env) {
  const ok = new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': ORIGIN } });
  if (req.headers.get('Origin') !== ORIGIN) return ok;                     // only the site itself
  const ua = req.headers.get('User-Agent') || '';
  if (!ua || BOT.test(ua)) return ok;
  let p = '/';
  try { p = String((JSON.parse(await req.text()) || {}).p || '/'); } catch (e) { return ok; }
  if (!PAGES.has(p)) return ok;
  let country = (req.cf && req.cf.country) || 'XX';
  if (!/^[A-Z]{2}$/.test(country) || country === 'T1') country = 'XX';     // Tor and unknown are 'XX'
  const d = day(), now = Date.now();
  const ip = req.headers.get('CF-Connecting-IP') || '';
  const h = await hash(`${env.SALT}|${d}|${ip}|${ua}`);

  // a repeat of the same page by the same visitor within ten minutes is not a new view
  const prev = await env.DB.prepare('SELECT ts FROM recent WHERE h = ? AND path = ?').bind(h, p).first();
  if (prev && now - prev.ts < REPEAT_MS) return ok;
  const isNew = await env.DB.prepare('INSERT OR IGNORE INTO seen (day, h) VALUES (?, ?)').bind(d, h).run();
  const stmts = [
    env.DB.prepare('INSERT INTO recent (h, path, ts) VALUES (?, ?, ?) ON CONFLICT (h, path) DO UPDATE SET ts = excluded.ts').bind(h, p, now),
    env.DB.prepare('INSERT INTO views (day, path, country, n) VALUES (?, ?, ?, 1) ON CONFLICT (day, path, country) DO UPDATE SET n = n + 1').bind(d, p, country)
  ];
  if (isNew.meta && isNew.meta.changes) {
    stmts.push(env.DB.prepare('INSERT INTO visitors (day, country, n) VALUES (?, ?, 1) ON CONFLICT (day, country) DO UPDATE SET n = n + 1').bind(d, country));
  }
  await env.DB.batch(stmts);
  return ok;
}

// the edge keeps the answer for 30 s (a burst of visitors costs one set of queries);
// browsers are told not to keep it at all, so a new view shows up at once
const CLIENT = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': ORIGIN };
async function stats(req, env, ctx) {
  const cache = caches.default, key = new Request(new URL('/stats', req.url).toString());
  const hitc = await cache.match(key);
  if (hitc) return new Response(await hitc.text(), { headers: CLIENT });
  const [tot, vis, countries, days, pages] = await env.DB.batch([
    env.DB.prepare('SELECT COALESCE(SUM(n), 0) AS views, MIN(day) AS since FROM views'),
    env.DB.prepare('SELECT COALESCE(SUM(n), 0) AS visitors FROM visitors'),
    env.DB.prepare("SELECT country AS c, SUM(n) AS v FROM views GROUP BY country ORDER BY v DESC"),
    env.DB.prepare('SELECT day AS d, SUM(n) AS v FROM views WHERE day >= ? GROUP BY day ORDER BY day').bind(day(-179)),
    env.DB.prepare('SELECT path AS p, SUM(n) AS v FROM views GROUP BY path ORDER BY v DESC')
  ]);
  const t = tot.results[0] || {};
  const body = JSON.stringify({
    views: t.views || 0, visitors: (vis.results[0] || {}).visitors || 0, since: t.since || null,
    countries: countries.results, days: days.results, pages: pages.results, updated: new Date().toISOString()
  });
  ctx.waitUntil(cache.put(key, new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' } })));
  return new Response(body, { headers: CLIENT });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    }
    if (url.pathname === '/hit' && req.method === 'POST') return hit(req, env);
    if (url.pathname === '/stats' && req.method === 'GET') return stats(req, env, ctx);
    return new Response('Not found', { status: 404 });
  },
  // daily: forget the visitor hashes and the repeat-view memory
  async scheduled(event, env) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM seen WHERE day < ?').bind(day(-1)),
      env.DB.prepare('DELETE FROM recent WHERE ts < ?').bind(Date.now() - 2 * 3600e3)
    ]);
  }
};
