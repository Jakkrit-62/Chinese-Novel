"""Live check against the real Cambridge site (run in CI, where the network is open):
    python -m app.smoke
Prints what the parser extracts so selector breakage is visible in the logs. Exits 1 if
nothing at all could be parsed."""
import asyncio
import sys

from . import cambridge
from .lookup import lookup_word

CASES = [("银行", ["yín", "háng"], None), ("了解", ["liǎo", "jiě"], None), ("一石二鸟", ["yī", "shí", "èr", "niǎo"], None)]


async def main() -> int:
    parsed_any = False
    for word, pinyin, context in CASES:
        info = await lookup_word(word, pinyin, context)
        print(f"\n=== {word}  best CEDICT sense: {info['senses'][0]['gloss'] if info['senses'] else '-'}")
        if info.get("error"):
            print("  error:", info["error"])
        for m in info["cambridge"]:
            parsed_any |= m["found"]
            print(f"  [{m['query']}] found={m['found']} matched={len(m['matched'])} unmatched={m['unmatchedCount']}")
            for s in m["matched"][:2]:
                print(f"    ({s['guideword']}) {s['definition']}  ->  {s['translation']}  match={s['match']}")
        if info["cambridgeIdiom"]:
            parsed_any = True
            print("  idiom:", info["cambridgeIdiom"])
    await cambridge.close_client()
    return 0 if parsed_any else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
