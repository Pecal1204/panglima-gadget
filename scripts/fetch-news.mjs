/**
 * Panglima Gadget — daily tech-news builder.
 *
 * Pulls headlines from public RSS feeds, keeps only phone/gadget/repair-relevant
 * items, and writes news-data.json for news.html to render.
 *
 * Copyright-safe by design: we store only the headline, a short trimmed excerpt,
 * the source name and a link back to the original article. Never the full text.
 *
 * No dependencies — Node 18+ (global fetch).
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "news-data.json");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/* Malay-language sources → BM tab. English sources → EN tab.
   (Using natively-written feeds avoids machine translation entirely.) */
const FEEDS = [
  { url: "https://amanz.my/feed/", source: "Amanz", lang: "bm" },
  { url: "https://soyacincau.com/feed/", source: "SoyaCincau", lang: "en" },
  { url: "https://www.gsmarena.com/rss-news-reviews.php3", source: "GSMArena", lang: "en" },
];

/* Keep only items relevant to a phone/laptop repair shop's customers. */
const KEYWORDS = [
  // devices & brands
  "telefon","smartphone","phone","iphone","ipad","samsung","galaxy","xiaomi","redmi","poco",
  "oppo","vivo","huawei","realme","honor","tecno","infinix","nothing","pixel","macbook",
  "laptop","komputer riba","tablet","android","ios","ipados",
  // parts & faults — the repair angle
  "bateri","battery","skrin","screen","display","paparan","amoled","oled","lcd",
  "cas","charging","charger","pengecas","usb-c","port","kamera","camera","lensa",
  "storan","storage","memori","memory","ram","cip","chip","chipset","processor","pemproses",
  "baiki","repair","rosak","kerosakan","waranti","warranty","kalis air","waterproof","ip68",
  "overheat","panas","haba","scam","penipuan","security","keselamatan","kemas kini","update",
  "5g","esim","fingerprint","cap jari",
];

const MAX_PER_LANG = 12;
const EXCERPT_LEN = 180;

/* ---------- tiny RSS parsing (regex — feeds here are well-formed) ---------- */

const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&hellip;/g, "…")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    /* &amp; last, so "&amp;lt;" becomes "&lt;" here and is resolved on the
       next loop pass rather than turning into a "<" prematurely. */
    .replace(/&amp;/g, "&");

const stripTags = (s) =>
  s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ");

/**
 * Feeds are inconsistent: some send plain text, some real HTML tags, and some
 * (GSMArena) send tags HTML-escaped as &lt;img …&gt;. Decoding and stripping
 * once in a fixed order can't cover all three — escaped tags survive as visible
 * "<img src=...>" junk. So alternate decode→strip until the text stops changing.
 */
const decode = (s = "") => {
  let out = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  for (let i = 0; i < 4; i++) {
    const before = out;
    out = stripTags(decodeEntities(out));
    if (out === before) break;
  }
  return out.replace(/\s+/g, " ").trim();
};

const pick = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decode(m[1]) : "";
};

/* Strip RSS tracking params/fragments so links stay clean and stable. */
function cleanLink(url) {
  return url.split("#utm_")[0].replace(/[?&]utm_[^&]*/g, "").replace(/[?&]$/, "");
}

function parseFeed(xml, source, lang) {
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return blocks.map((b) => {
    const title = pick(b, "title");
    const link = (b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] || "").trim();
    const raw = pick(b, "description") || pick(b, "content:encoded");
    let excerpt = raw.slice(0, EXCERPT_LEN);
    if (raw.length > EXCERPT_LEN) excerpt = excerpt.replace(/\s+\S*$/, "") + "…";
    const dateStr = pick(b, "pubDate") || pick(b, "dc:date");
    const date = dateStr ? new Date(dateStr) : null;
    return {
      title,
      link: cleanLink(decode(link)),
      excerpt,
      source,
      lang,
      published: date && !isNaN(date) ? date.toISOString() : null,
    };
  });
}

/* Whole-word matching — substring matching produced false positives
   (e.g. "cip" matched "Hak Cipta", "port" matched "important"). */
const KEYWORD_RE = new RegExp(
  `(^|[^a-z0-9])(${KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})([^a-z0-9]|$)`,
  "i"
);

const isRelevant = (item) => KEYWORD_RE.test(`${item.title} ${item.excerpt}`.toLowerCase());

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseFeed(xml, feed.source, feed.lang).filter((i) => i.title && i.link);
    console.log(`  ${feed.source.padEnd(12)} ${items.length} items fetched`);
    return items;
  } catch (err) {
    console.warn(`  ${feed.source.padEnd(12)} FAILED — ${err.message}`);
    return [];
  }
}

/* ------------------------------- build ------------------------------- */

console.log("Fetching feeds…");
const all = (await Promise.all(FEEDS.map(fetchFeed))).flat();

if (all.length === 0) {
  // Never publish an empty page — keep whatever was there before.
  console.error("All feeds failed. Keeping existing news-data.json unchanged.");
  process.exit(existsSync(OUT) ? 0 : 1);
}

const byDate = (a, b) => new Date(b.published || 0) - new Date(a.published || 0);
const dedupe = (items) => {
  const seen = new Set();
  return items.filter((i) => {
    const key = i.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const forLang = (lang) => {
  const pool = all.filter((i) => i.lang === lang);
  const relevant = dedupe(pool.filter(isRelevant)).sort(byDate);
  // If filtering is too aggressive on a quiet day, top up with recent general items.
  const filler = dedupe(pool.filter((i) => !isRelevant(i))).sort(byDate);
  return [...relevant, ...filler].slice(0, MAX_PER_LANG);
};

const data = {
  generated: new Date().toISOString(),
  sources: [...new Set(FEEDS.map((f) => f.source))],
  bm: forLang("bm"),
  en: forLang("en"),
};

if (data.bm.length === 0 && data.en.length === 0) {
  console.error("No usable items after filtering. Keeping existing file.");
  process.exit(existsSync(OUT) ? 0 : 1);
}

writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
console.log(`\nWrote news-data.json — ${data.bm.length} BM, ${data.en.length} EN items.`);
