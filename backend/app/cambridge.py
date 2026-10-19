"""Cambridge Dictionary lookups, reached through English headwords.

Cambridge has no Chinese-headword dictionary we can query with 银行, so meaning.py turns
CC-CEDICT glosses into English headwords ("bank"); we fetch the English-Chinese (Simplified)
entry and keep only senses whose Chinese translation maps back to the original word
(bank/银行 kept, bank/河岸 dropped). Idioms are looked up in the English dictionary instead.

Politeness / anti-blocking: browser-like headers with rotating UA, one shared client,
concurrency 2, >=0.5 s between upstream requests, backoff on 403/429/5xx honouring
Retry-After, and a 24 h TTL cache of parsed results. Keep in sync with app/src/lib/cambridge.ts.
"""
import asyncio
import random
import re
import time
from collections import OrderedDict
from urllib.parse import quote

import httpx
from bs4 import BeautifulSoup, Tag

BASE = "https://dictionary.cambridge.org"
EN_ZH = "/dictionary/english-chinese-simplified/"
EN = "/dictionary/english/"

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
]
HAN = re.compile(r"[㐀-鿿豈-﫿]")

CACHE_TTL = 60 * 60 * 24
CACHE_SIZE = 5000
MIN_INTERVAL = 0.5
MAX_CONCURRENCY = 2
MAX_RETRIES = 3


class _TTLCache:
    def __init__(self, size: int, ttl: float):
        self.size, self.ttl = size, ttl
        self._data: OrderedDict[str, tuple[float, object]] = OrderedDict()

    def get(self, key: str):
        item = self._data.get(key)
        if not item or item[0] < time.monotonic():
            self._data.pop(key, None)
            return None
        self._data.move_to_end(key)
        return item

    def set(self, key: str, value) -> None:
        self._data[key] = (time.monotonic() + self.ttl, value)
        self._data.move_to_end(key)
        while len(self._data) > self.size:
            self._data.popitem(last=False)


_cache = _TTLCache(CACHE_SIZE, CACHE_TTL)
_semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
_rate_lock = asyncio.Lock()
_last_request = 0.0
_client: httpx.AsyncClient | None = None


def _headers() -> dict[str, str]:
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9,zh-CN;q=0.8",
        "Referer": BASE + "/",
    }


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=10, follow_redirects=True)
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


def slug(phrase: str) -> str:
    return quote(re.sub(r"\s+", "-", phrase.strip().lower()))


def _text(node: Tag | None) -> str:
    return " ".join(node.get_text(" ", strip=True).split()) if node else ""


def _first(parent: Tag, *selectors: str) -> Tag | None:
    for sel in selectors:
        found = parent.select_one(sel)
        if found:
            return found
    return None


def parse_senses(html: str) -> list[dict]:
    """All senses on an English-Chinese (or English) entry page, with guideword and Chinese translation."""
    soup = BeautifulSoup(html, "lxml")
    senses = []
    for block in soup.select("div.def-block, div.ddef_block"):
        entry = block.find_parent(class_=["entry-body__el", "dictionary", "di-body"])
        sense = block.find_parent(class_=["dsense", "sense-block"])
        body = _first(block, ".def-body", ".ddef_b")
        translation = ""
        if body:
            direct = body.find(class_="trans", recursive=False)
            translation = _text(direct or body.select_one(".trans.dtrans"))
        definition = _text(_first(block, ".def.ddef_d", ".ddef_d", ".def")).rstrip(":").strip()
        if not definition:
            continue
        senses.append({
            "guideword": _text(_first(sense, ".guideword", ".dsense_gw")).strip("() ") if sense else "",
            "pos": _text(_first(entry, ".pos.dpos", "span.pos")) if entry else "",
            "definition": definition,
            "translation": translation,
            "examples": [
                {"en": _text(_first(ex, ".eg", ".deg")), "zh": _text(_first(ex, ".trans", ".dtrans"))}
                for ex in block.select(".examp, .dexamp")
                if _text(_first(ex, ".eg", ".deg"))
            ][:2],
        })
    return senses


def back_match(word: str, translation: str) -> float:
    """1 = a listed translation equals the word, 0.9 = contains it, else share of its characters / 2."""
    if not translation:
        return 0.0
    alternatives = [re.sub(r"[（(].*?[)）]", "", t) for t in re.split(r"[；;，,、\s]+", translation)]
    if word in alternatives:
        return 1.0
    if word in translation:
        return 0.9
    chars = HAN.findall(word)
    return sum(c in translation for c in chars) / len(chars) / 2 if chars else 0.0


async def _fetch_parsed(url: str) -> list[dict] | None:
    cached = _cache.get(url)
    if cached:
        return cached[1]
    async with _semaphore:
        for attempt in range(MAX_RETRIES):
            await _throttle()
            resp = await _get_client().get(url, headers=_headers())
            if resp.status_code in (200, 404):
                ok = resp.status_code == 200 and "entry-body" in resp.text  # unknown words land on a spellcheck page
                parsed = parse_senses(resp.text) if ok else None
                _cache.set(url, parsed)
                return parsed
            if resp.status_code in (403, 429) or resp.status_code >= 500:
                retry_after = resp.headers.get("Retry-After", "")
                await asyncio.sleep(min(float(retry_after) if retry_after.isdigit() else 2**attempt + random.random(), 10))
                continue
            resp.raise_for_status()
    raise httpx.HTTPError(f"Cambridge kept refusing {url}")


async def map_to_cambridge(word: str, headword: str) -> dict:
    url = BASE + EN_ZH + slug(headword)
    senses = await _fetch_parsed(url)
    if senses is None:
        return {"query": headword, "url": url, "found": False, "matched": [], "unmatchedCount": 0}
    scored = [{**s, "match": back_match(word, s["translation"])} for s in senses]
    matched = sorted((s for s in scored if s["match"] >= 0.5), key=lambda s: -s["match"])
    return {"query": headword, "url": url, "found": True, "matched": matched, "unmatchedCount": len(scored) - len(matched)}


async def lookup_english_idiom(phrase: str) -> dict | None:
    url = BASE + EN + slug(phrase)
    senses = await _fetch_parsed(url)
    if not senses:
        return None
    return {"phrase": phrase, "url": url, "definitions": [s["definition"] for s in senses][:3]}
