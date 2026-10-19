import { httpRequest } from "./http";
import type { CambridgeEntry, DictionaryResult } from "./types";

/**
 * On-device port of backend/app/cambridge.py. Keep the selectors in sync with the Python parser.
 */
const BASE = "https://dictionary.cambridge.org";
const DICT_PATHS = ["/dictionary/chinese-english/", "/dictionary/chinese-simplified-english/"];
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9,zh-CN;q=0.8",
  Referer: BASE + "/",
};
const CACHE_KEY = "cambridge-cache-v1";
const CACHE_MAX = 500;
const MIN_INTERVAL_MS = 500;

const text = (n: Element | null | undefined) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();
const first = (parent: Element, ...selectors: string[]) => {
  for (const sel of selectors) {
    const found = parent.querySelector(sel);
    if (found) return found;
  }
  return null;
};

export function parseEntryHtml(html: string, word: string): DictionaryResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  let blocks = Array.from(doc.querySelectorAll("div.entry-body__el"));
  if (!blocks.length) blocks = Array.from(doc.querySelectorAll("div.pr.dictionary"));
  if (!blocks.length) blocks = Array.from(doc.querySelectorAll("div.di-body"));
  const entries: CambridgeEntry[] = [];
  for (const block of blocks) {
    const pos = [...new Set(Array.from(block.querySelectorAll(".pos.dpos, span.pos")).map(text).filter(Boolean))].sort();
    const senses = Array.from(block.querySelectorAll("div.def-block, div.ddef_block"))
      .map((sense) => ({
        definition: text(first(sense, ".def.ddef_d", ".ddef_d", ".def")),
        translation: text(first(sense, ".def-body > .trans", ".ddef_b > .trans", ".trans.dtrans")),
        examples: Array.from(sense.querySelectorAll(".examp, .dexamp"))
          .map((ex) => ({ zh: text(first(ex, ".eg", ".deg")), en: text(first(ex, ".trans", ".dtrans")) }))
          .filter((ex) => ex.zh)
          .slice(0, 3),
      }))
      .filter((s) => s.definition || s.translation);
    if (senses.length) {
      entries.push({
        headword: text(first(block, ".headword", ".hw", ".dhw")) || word,
        pinyin: text(first(block, ".pinyin", ".pron.dpron", ".pron")),
        pos,
        senses,
      });
    }
  }
  return { word, found: entries.length > 0, entries };
}

function readCache(): Record<string, DictionaryResult> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeCache(word: string, result: DictionaryResult) {
  try {
    const cache = readCache();
    cache[word] = result;
    const keys = Object.keys(cache);
    for (const k of keys.slice(0, Math.max(0, keys.length - CACHE_MAX))) delete cache[k];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or unavailable - caching is optional */
  }
}

let lastRequest = 0;
async function throttle() {
  const wait = lastRequest + MIN_INTERVAL_MS - Date.now();
  lastRequest = Date.now() + Math.max(0, wait);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export async function lookupCambridgeLocal(word: string): Promise<DictionaryResult> {
  const cached = readCache()[word];
  if (cached) return cached;
  let result: DictionaryResult = { word, found: false, entries: [] };
  for (const path of DICT_PATHS) {
    const url = BASE + path + encodeURIComponent(word);
    for (let attempt = 0; attempt < 3; attempt++) {
      await throttle();
      const res = await httpRequest(url, { headers: HEADERS });
      if (res.status === 200) {
        result = parseEntryHtml(res.data, word);
        if (result.found) result.source_url = url;
        break;
      }
      if (res.status === 404) break;
      if (res.status === 429 || res.status === 403 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
        continue;
      }
      throw new Error(`Cambridge returned HTTP ${res.status}`);
    }
    if (result.found) break;
  }
  writeCache(word, result);
  return result;
}
