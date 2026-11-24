-- Aggregates only. No IP addresses; visitor hashes live one day (see worker.js).
CREATE TABLE IF NOT EXISTS views (
  day TEXT NOT NULL,          -- YYYY-MM-DD, UTC
  path TEXT NOT NULL,         -- one of the site's pages
  country TEXT NOT NULL,      -- ISO 3166-1 alpha-2, or XX
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, path, country)
);
CREATE TABLE IF NOT EXISTS visitors (
  day TEXT NOT NULL,
  country TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, country)
);
-- short-lived: which (salted, daily) visitor hashes have been seen today
CREATE TABLE IF NOT EXISTS seen (
  day TEXT NOT NULL,
  h TEXT NOT NULL,
  PRIMARY KEY (day, h)
);
-- short-lived: last view time per visitor hash and page, to ignore quick repeats
CREATE TABLE IF NOT EXISTS recent (
  h TEXT NOT NULL,
  path TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (h, path)
);
