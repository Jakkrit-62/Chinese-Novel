"""Live check against the real Cambridge site (run in CI, where the network is open):
    python -m app.smoke
Prints what the parser extracts so selector breakage is visible in the logs. Exits 1 if
nothing at all could be parsed."""
import asyncio
import sys

from . import cambridge
from .lookup import lookup_word

DIAGNOSE: list[str] = []  # add URLs here to dump raw HTML diagnostics into the CI log

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
    # Raw view of pages the parser couldn't read, to fix selectors from the CI log.
    for url in DIAGNOSE:
        resp = await cambridge._get_client().get(url, headers=cambridge._headers())
        html = resp.text
        print(f"\n--- {url}\n  status={resp.status_code} final={resp.url} entry-body={'entry-body' in html} "
              f"def-block={'def-block' in html} idiom-block={'idiom-block' in html} parsed={len(cambridge.parse_senses(html))}")
        i = html.find('class="def ')
        print("  snippet:", " ".join(html[max(0, i - 600): i + 300].split())[:900] if i >= 0 else "(no def)")
    await cambridge.close_client()
    return 0 if parsed_any else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
