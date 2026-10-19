"""Cambridge Dictionary (Chinese -> English) scraper.

Cambridge has no public API, so we fetch the HTML entry page server-side and parse it.
The browser/app never talks to Cambridge directly, which sidesteps CORS entirely.

Politeness / anti-blocking measures:
  * realistic browser headers (UA, Accept, Accept-Language, Referer)
  * one shared HTTP/2 client with connection reuse
  * global concurrency limit + minimum interval between upstream requests
  * retry with exponential backoff on 429 / 5xx, honouring Retry-After
  * in-memory TTL cache so repeated taps on the same word never hit Cambridge twice
"""
import asyncio
import random
import time
from collections import OrderedDict
from urllib.parse import quote

import httpx
from bs4 import BeautifulSoup, Tag

BASE = "https://dictionary.cambridge.org"
# The first path is the one requested in the spec; Cambridge also serves the
# simplified-script dictionary under the second path, so we fall back to it.
DICT_PATHS = ("/dictionary/chinese-english/{}", "/dictionary/chinese-simplified-english/{}")

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
]

CACHE_TTL = 60 * 60 * 24  # a day
CACHE_SIZE = 5000
MIN_INTERVAL = 0.5  # seconds between upstream requests
MAX_CONCURRENCY = 2
MAX_RETRIES = 3


class _TTLCache:
    def __init__(self, size: int, ttl: float):
        self.size, self.ttl = size, ttl
        self._data: OrderedDict[str, tuple[float, dict]] = OrderedDict()

    def get(self, key: str) -> dict | None:
        item = self._data.get(key)
        if not item or item[0] < time.monotonic():
            self._data.pop(key, None)
            return None
        self._data.move_to_end(key)
        return item[1]

    def set(self, key: str, value: dict) -> None:
        self._data[key] = (time.monotonic() + self.ttl, value)
        self._data.move_to_end(key)
        while len(self._data) > self.size:
            self._data.popitem(last=False)


_cache = _TTLCache(CACHE_SIZE, CACHE_TTL)
_semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
_last_request = 0.0
_rate_lock = asyncio.Lock()
_client: httpx.AsyncClient | None = None


def _headers() -> dict[str, str]:
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9,zh-CN;q=0.8",
        "Referer": BASE + "/",
        "Cache-Control": "no-cache",
    }


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=10, follow_redirects=True, http2=False)
    return _client


async def close_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def _throttle() -> None:
    global _last_request
    async with _rate_lock:
        wait = _last_request + MIN_INTERVAL - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)
        _last_request = time.monotonic()


async def _fetch(url: str) -> str | None:
    """GET with retries. Returns HTML, or None for 404."""
    async with _semaphore:
        for attempt in range(MAX_RETRIES):
            await _throttle()
            resp = await _get_client().get(url, headers=_headers())
            if resp.status_code == 404:
                return None
            if resp.status_code == 200:
                return resp.text
            if resp.status_code in (403, 429) or resp.status_code >= 500:
                retry_after = resp.headers.get("Retry-After", "")
                delay = float(retry_after) if retry_after.isdigit() else 2**attempt + random.random()
                await asyncio.sleep(min(delay, 10))
                continue
            resp.raise_for_status()
    raise httpx.HTTPError(f"Cambridge kept refusing {url}")


def _text(node: Tag | None) -> str:
    return " ".join(node.get_text(" ", strip=True).split()) if node else ""


def _first(parent: Tag, *selectors: str) -> Tag | None:
    for sel in selectors:
        found = parent.select_one(sel)
        if found:
            return found
    return None


def parse_entry_html(html: str, word: str) -> dict:
    """Extract headword, pinyin, part(s) of speech, definitions and examples.

    Selectors cover both the current (`ddef_d`, `dpos`...) and older (`def`, `pos`) class names
    so a cosmetic Cambridge redesign degrades gracefully instead of returning nothing.
    """
    soup = BeautifulSoup(html, "lxml")
    blocks = soup.select("div.entry-body__el") or soup.select("div.pr.dictionary") or soup.select("div.di-body")
    entries = []
    for block in blocks:
        headword = _text(_first(block, ".headword", ".hw", ".dhw")) or word
        pos = sorted({_text(p) for p in block.select(".pos.dpos, span.pos") if _text(p)})
        pron = _text(_first(block, ".pinyin", ".pron.dpron", ".pron"))
        senses = []
        for sense in block.select("div.def-block, div.ddef_block"):
            definition = _text(_first(sense, ".def.ddef_d", ".ddef_d", ".def"))
            translation = _text(_first(sense, ".def-body > .trans", ".ddef_b > .trans", ".trans.dtrans"))
            examples = []
            for ex in sense.select(".examp, .dexamp"):
                zh = _text(_first(ex, ".eg", ".deg"))
                en = _text(_first(ex, ".trans", ".dtrans"))
                if zh:
                    examples.append({"zh": zh, "en": en})
            if definition or translation:
                senses.append({"definition": definition, "translation": translation, "examples": examples[:3]})
        if senses:
            entries.append({"headword": headword, "pinyin": pron, "pos": pos, "senses": senses})
    return {"word": word, "found": bool(entries), "entries": entries}


async def lookup(word: str) -> dict:
    word = word.strip()
    cached = _cache.get(word)
    if cached:
        return {**cached, "cached": True}
    result = {"word": word, "found": False, "entries": []}
    for path in DICT_PATHS:
        url = BASE + path.format(quote(word))
        html = await _fetch(url)
        if html is None:
            continue
        result = parse_entry_html(html, word)
        if result["found"]:
            result["source_url"] = url
            break
    _cache.set(word, result)
    return {**result, "cached": False}
