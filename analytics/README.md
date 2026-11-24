# Visitor counter

A Cloudflare Worker with a D1 database that counts page views for
kuangxh9.github.io and serves aggregate numbers to the visitor footprint on the
home page. It runs on Cloudflare's free tier; GitHub Pages only serves the
static site and the small client script (`assets/js/footprint.js`).

## What is stored

| Table | Columns | Lifetime |
| --- | --- | --- |
| `views` | day, page, country, count | kept |
| `visitors` | day, country, count of distinct visitors that day | kept |
| `seen` | day, salted hash of the visitor | one day |
| `recent` | salted hash, page, time of last view | two hours |

No IP address is stored. A visitor is recognised within one day only, by a
SHA-256 hash of a secret salt, the date, the IP address and the user agent; the
hash cannot be reversed, changes every day, and is deleted by a daily cron.
Country comes from Cloudflare (`request.cf.country`). There are no cookies.

Not counted: requests from any other origin, common bots and automation, a
repeat view of the same page within ten minutes, browsers sending Do Not Track
or Global Privacy Control, `navigator.webdriver`, local previews, and any
browser that has visited once with `?notrack=1` (use this for your own
devices; `?notrack=0` undoes it).

The home page shows page views and the number of countries. `/stats` also
reports "visitors", the sum of daily distinct visitors: someone who returns on
another day is counted again, so it is an estimate and is not shown as a
headline number.

## Setup (once)

You need a free Cloudflare account and Node.js.

```sh
npm install -g wrangler
wrangler login
cd analytics
cp wrangler.toml.example wrangler.toml
wrangler d1 create kuangxh9-stats          # copy the database_id it prints into wrangler.toml
wrangler d1 execute kuangxh9-stats --remote --file schema.sql
wrangler secret put SALT                   # paste a long random string; never commit it
wrangler deploy                            # prints https://kuangxh9-stats.<your-subdomain>.workers.dev
```

Then put that address in two places and publish:

- `tools/build_pages.py`: `STATS = 'https://kuangxh9-stats.<your-subdomain>.workers.dev'`
- `index.html`: `<meta name="xk-stats" content="https://kuangxh9-stats.<your-subdomain>.workers.dev">`

```sh
python -I tools/build_pages.py .
```

Visit `https://kuangxh9.github.io/?notrack=1` once in each of your own browsers.
The footprint appears on the home page once the counter has data.

## Checking it

```sh
curl https://kuangxh9-stats.<your-subdomain>.workers.dev/stats
wrangler d1 execute kuangxh9-stats --remote --command "SELECT * FROM views ORDER BY day DESC LIMIT 20"
```

## Map data

`assets/data/world.json` (land as a dot grid, and a centroid per country) is
built from Natural Earth 1:110m (public domain) by `tools/worldmap.py`. Very
small countries are not in that dataset: they are counted, but have no mark.
