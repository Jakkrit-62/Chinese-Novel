"""Build the compact HSK 1-6 word list used by the backend and the Android app.

Source: drkameleon/complete-hsk-vocabulary (MIT), "old" HSK 2.0 levels 1-6.
Meanings come from CC-CEDICT (CC BY-SA 4.0) via that dataset.

Usage: python scripts/build_hsk_data.py [path/to/downloaded/json/dir]
"""
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
URL = "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/old/{}.json"
OUTPUTS = [ROOT / "backend" / "app" / "data" / "hsk.json", ROOT / "app" / "public" / "hsk.json"]


def load_level(level: int, src_dir: Path | None) -> list:
    if src_dir:
        return json.loads((src_dir / f"old{level}.json").read_text(encoding="utf-8"))
    with urllib.request.urlopen(URL.format(level)) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _useful(meanings: list[str]) -> bool:
    """False for glosses that only say 'surname X' / 'used in ...' / 'variant of ...'."""
    return any(not m.startswith(("surname ", "used in ", "variant of ", "old variant of ")) for m in meanings)


def main() -> None:
    src_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    words: dict[str, dict] = {}
    for level in range(1, 7):
        for entry in load_level(level, src_dir):
            word = entry["simplified"]
            if word in words:  # keep the lowest level
                continue
            forms = entry["forms"]
            # Prefer the common reading: lower-case pinyin (not a proper noun) with real meanings.
            main = next((f for f in forms if f["transcriptions"]["pinyin"][:1].islower() and _useful(f["meanings"])), forms[0])
            meanings = [m for f in [main, *forms] if f is main or f["transcriptions"]["pinyin"] == main["transcriptions"]["pinyin"]
                        for m in f["meanings"] if _useful([m])]
            words[word] = {
                "l": level,
                "p": main["transcriptions"]["pinyin"],
                "m": list(dict.fromkeys(meanings))[:3] or main["meanings"][:3],
            }
    for out in OUTPUTS:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(words, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"wrote {len(words)} words -> {out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
