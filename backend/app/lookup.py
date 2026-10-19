"""Full word lookup in context: CC-CEDICT ranking, idiom sources, Cambridge back-mapping."""
import httpx

from . import cambridge
from .data import cedict, idioms
from .meaning import english_headwords, english_idiom_candidate, idiom_info, rank_senses

MAX_QUERIES = 3
TOP_TIER = 0.5  # only senses this close to the best one are sent to Cambridge


async def lookup_word(word: str, pinyin: list[str], context: str | None) -> dict:
    info = {
        "word": word,
        "senses": rank_senses(word, pinyin, context, cedict()),
        "idiom": idiom_info(word, cedict(), idioms()),
        "cambridge": [],
        "cambridgeIdiom": None,
        "context": context,
    }
    try:
        if info["idiom"]:
            phrase = english_idiom_candidate(info["idiom"])
            info["cambridgeIdiom"] = await cambridge.lookup_english_idiom(phrase) if phrase else None
            return info
        best = info["senses"][0]["score"] if info["senses"] else 0
        queries: list[tuple[str, str]] = []
        for sense in (s for s in info["senses"] if s["score"] >= best - TOP_TIER):
            for headword in english_headwords(sense["gloss"]):
                if all(q[0] != headword for q in queries):
                    queries.append((headword, sense["gloss"]))
        for headword, gloss in queries[:MAX_QUERIES]:
            info["cambridge"].append({**await cambridge.map_to_cambridge(word, headword), "gloss": gloss})
        info["cambridge"].sort(key=lambda m: -(m["matched"][0]["match"] if m["matched"] else -1))
    except httpx.HTTPError as exc:
        info["error"] = str(exc)
    return info
