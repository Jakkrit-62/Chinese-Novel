/**
 * Cambridge Dictionary on device. Cambridge is indexed by English headwords, so we never send
 * Chinese to it: meaning.ts produces English headwords from CC-CEDICT, we look those up in the
 * English-Chinese (Simplified) dictionary, then keep only senses whose Chinese translation maps
 * back to the original Chinese word. Requests go through the native HTTP stack (no CORS).
 *
 * Keep selectors and scoring in sync with backend/app/cambridge.py.
 */
import { httpRequest } from "./http";
import type { CambridgeIdiom, CambridgeMapping, CambridgeSense } from "./types";

const BASE = "https://dictionary.cambridge.org";
const EN_ZH = "/dictionary/english-chinese-simplified/";
const EN = "/dictionary/english/";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9,zh-CN;q=0.8",
  Referer: BASE + "/",
};
const CACHE_KEY = "cambridge-v2";
const CACHE_MAX = 300;
const MIN_INTERVAL_MS = 500;
const HAN = /[㐀-鿿豈-﫿]/g;

const text = (n: Element | null | undefined) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();
const first = (parent: Element, ...selectors: string[]) => {
  for (const sel of selectors) {
    const found = parent.querySelector(sel);
    if (found) return found;
  }
  return null;
};

export const slug = (phrase: string) => encodeURIComponent(phrase.trim().toLowerCase().replace(/\s+/g, "-"));

/**
 * How well a Cambridge Chinese translation ("银行；河岸") maps back to `word`:
 * 1 if any alternative equals the word, 0.9 if it contains it, otherwise the share of the word's
 * characters that appear in the translation (了解 vs 理解 = 0.5).
 */
export function backMatch(word: string, translation: string): number {
  if (!translation) return 0;
  const alternatives = translation.split(/[；;，,、\s]+/).map((t) => t.replace(/[（(].*?[)）]/g, ""));
  if (alternatives.includes(word)) return 1;
  if (translation.includes(word)) return 0.9;
  const chars = Array.from(word.match(HAN) ?? []);
  if (!chars.length) return 0;
  return chars.filter((c) => translation.includes(c)).length / chars.length / 2;
}

/** Parse an English-Chinese (or monolingual English) entry page into senses. */
export function parseSenses(html: string): { pos: string; senses: Omit<CambridgeSense, "match">[] } {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const senses: Omit<CambridgeSense, "match">[] = [];
  let firstPos = "";
  for (const block of Array.from(doc.querySelectorAll("div.def-block, div.ddef_block"))) {
    const entry = block.closest(".entry-body__el, .pr.dictionary, .di-body");
    const pos = entry ? text(first(entry, ".pos.dpos", "span.pos")) : "";
    firstPos ||= pos;
    const sense = block.closest(".dsense, .sense-block");
    const body = first(block, ".def-body", ".ddef_b");
    senses.push({
      guideword: sense ? text(first(sense, ".guideword", ".dsense_gw")).replace(/[()]/g, "").trim() : "",
      pos,
      definition: text(first(block, ".def.ddef_d", ".ddef_d", ".def")).replace(/:$/, ""),
      translation: body ? text(first(body, ":scope > .trans", ".trans.dtrans")) : "",
      examples: Array.from(block.querySelectorAll(".examp, .dexamp"))
        .map((ex) => ({ en: text(first(ex, ".eg", ".deg")), zh: text(first(ex, ".trans", ".dtrans")) }))
        .filter((ex) => ex.en)
        .slice(0, 2),
    });
  }
  return { pos: firstPos, senses: senses.filter((s) => s.definition) };
}

type Parsed = ReturnType<typeof parseSenses>;

function readCache(): Record<string, Parsed | null> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeCache(url: string, parsed: Parsed | null) {
  try {
    const cache = readCache();
    cache[url] = parsed;
    const keys = Object.keys(cache);
    for (const k of keys.slice(0, Math.max(0, keys.length - CACHE_MAX))) delete cache[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full - caching is optional */
  }
}

let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = now + wait + MIN_INTERVAL_MS;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

/** Fetch + parse a Cambridge page (cached); null when the entry doesn't exist. Retries on 403/429/5xx. */
async function fetchParsed(url: string): Promise<Parsed | null> {
  const cache = readCache();
  if (url in cache) return cache[url];
  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle();
    const res = await httpRequest(url, { headers: HEADERS });
    if (res.status === 200 || res.status === 404) {
      // Unknown words redirect to a spellcheck page with no entry body.
      const parsed = res.status === 200 && res.data.includes("entry-body") ? parseSenses(res.data) : null;
      writeCache(url, parsed);
      return parsed;
    }
    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
      continue;
    }
    throw new Error(`Cambridge HTTP ${res.status}`);
  }
  throw new Error("Cambridge is rate-limiting requests");
}

export async function mapToCambridge(word: string, headword: string): Promise<CambridgeMapping> {
  const url = BASE + EN_ZH + slug(headword);
  const parsed = await fetchParsed(url);
  if (!parsed) return { query: headword, url, found: false, matched: [], unmatchedCount: 0 };
  const senses = parsed.senses.map((s) => ({ ...s, match: backMatch(word, s.translation) }));
  const matched = senses.filter((s) => s.match >= 0.5).sort((a, b) => b.match - a.match);
  return { query: headword, url, found: true, matched, unmatchedCount: senses.length - matched.length };
}

export async function lookupEnglishIdiom(phrase: string): Promise<CambridgeIdiom | null> {
  const url = BASE + EN + slug(phrase);
  const parsed = await fetchParsed(url);
  if (!parsed) return null;
  const definitions = parsed.senses.map((s) => s.definition).slice(0, 3);
  return definitions.length ? { phrase, url, definitions } : null;
}
