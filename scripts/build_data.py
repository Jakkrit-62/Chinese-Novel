"""Build the dictionary data shared by the Android app and the FastAPI backend.

Outputs (in /data, copied into app/public by `npm run copy-data`):
  hsk.json      word -> {l: HSK level 1-6, p: pinyin, m: [short glosses]}
  cedict.json   word -> [[pinyin, [english glosses...], [classifiers...]], ...]   (full CC-CEDICT)
  idioms.json   word -> {p: pinyin, x: Chinese explanation}                      (Xinhua idiom dictionary)
  phrases.txt   idioms + CC-CEDICT "(idiom)" entries, one per line - loaded into jieba so they stay whole

Sources and licences:
  HSK 2.0 lists   drkameleon/complete-hsk-vocabulary (MIT)
  CC-CEDICT       via npm package cedict-json (CC BY-SA 4.0)
  Xinhua idioms   pwxcoo/chinese-xinhua (MIT)

Usage: python scripts/build_data.py [--cache DIR]   (DIR holds previously downloaded inputs)
"""
import argparse
import io
import json
import re
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data"
HSK_URL = "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/old/{}.json"
CEDICT_TGZ = "https://registry.npmjs.org/cedict-json/-/cedict-json-1.3.20251213.tgz"
IDIOM_URL = "https://raw.githubusercontent.com/pwxcoo/chinese-xinhua/master/data/idiom.json"

TONE_MARKS = {"a": "āáǎà", "e": "ēéěè", "i": "īíǐì", "o": "ōóǒò", "u": "ūúǔù", "ü": "ǖǘǚǜ"}


def numeric_to_marks(syllable: str) -> str:
    """'hang2' -> 'háng', 'lu:4' -> 'lǜ', 'ma5' -> 'ma'. Non-pinyin tokens are returned unchanged."""
    m = re.fullmatch(r"([a-zA-Zü:]+)([1-5])", syllable)
    if not m:
        return syllable
    body, tone = m.group(1).replace("u:", "ü").replace("U:", "Ü"), int(m.group(2))
    if tone == 5:
        return body
    lower = body.lower()
    # Standard placement: a/e take the mark; in "ou" the o does; otherwise the last vowel.
    if "a" in lower:
        idx = lower.index("a")
    elif "e" in lower:
        idx = lower.index("e")
    elif "ou" in lower:
        idx = lower.index("o")
    else:
        idx = max(lower.rfind(v) for v in "iouü")
        if idx < 0:
            return body
    marked = TONE_MARKS[lower[idx]][tone - 1]
    return body[:idx] + (marked.upper() if body[idx].isupper() else marked) + body[idx + 1 :]


def fetch(url: str, cache: Path | None, name: str) -> bytes:
    if cache and (cache / name).exists():
        return (cache / name).read_bytes()
    with urllib.request.urlopen(url) as resp:
        data = resp.read()
    if cache:
        cache.mkdir(parents=True, exist_ok=True)
        (cache / name).write_bytes(data)
    return data


def _useful(meanings: list[str]) -> bool:
    return any(not m.startswith(("surname ", "used in ", "variant of ", "old variant of ")) for m in meanings)


def build_hsk(cache: Path | None) -> dict:
    words: dict[str, dict] = {}
    for level in range(1, 7):
        for entry in json.loads(fetch(HSK_URL.format(level), cache, f"old{level}.json")):
            word = entry["simplified"]
            if word in words:
                continue
            forms = entry["forms"]
            main = next((f for f in forms if f["transcriptions"]["pinyin"][:1].islower() and _useful(f["meanings"])), forms[0])
            meanings = [m for f in forms if f["transcriptions"]["pinyin"] == main["transcriptions"]["pinyin"]
                        for m in f["meanings"] if _useful([m])]
            words[word] = {"l": level, "p": main["transcriptions"]["pinyin"],
                           "m": list(dict.fromkeys(meanings))[:3] or main["meanings"][:3]}
    return words


def build_cedict(cache: Path | None) -> dict:
    with tarfile.open(fileobj=io.BytesIO(fetch(CEDICT_TGZ, cache, "cedict-json.tgz"))) as tar:
        entries = json.load(tar.extractfile("package/cedict.json"))
    out: dict[str, list] = {}
    for e in entries:
        pinyin = " ".join(numeric_to_marks(s) for s in e["pinyin"].split())
        glosses, classifiers = [], []
        for g in e["english"]:
            if g.startswith("CL:"):
                classifiers += [c.split("[")[0].split("|")[-1] for c in g[3:].split(",")]
            else:
                glosses.append(g)
        senses = out.setdefault(e["simplified"], [])
        same = next((s for s in senses if s[0] == pinyin), None)
        if same:  # merge duplicate entries (e.g. simplified form shared by two traditional forms)
            same[1] += [g for g in glosses if g not in same[1]]
            same[2] += [c for c in classifiers if c not in same[2]]
        elif glosses:
            senses.append([pinyin, glosses, classifiers])
    return out


def build_idioms(cache: Path | None) -> dict:
    out = {}
    for e in json.loads(fetch(IDIOM_URL, cache, "idiom.json")):
        explanation = e["explanation"].strip()
        if e["word"] and explanation:
            out[e["word"]] = {"p": e["pinyin"], "x": explanation}
    return out


def write(name: str, data) -> None:
    path = OUT / name
    if isinstance(data, str):
        path.write_text(data, encoding="utf-8")
    else:
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{name}: {path.stat().st_size / 1e6:.1f} MB")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path)
    args = parser.parse_args()
    OUT.mkdir(exist_ok=True)
    hsk, cedict, idioms = build_hsk(args.cache), build_cedict(args.cache), build_idioms(args.cache)
    cedict_idioms = {w for w, senses in cedict.items() if any("(idiom)" in g for s in senses for g in s[1])}
    write("hsk.json", hsk)
    write("cedict.json", cedict)
    write("idioms.json", idioms)
    write("phrases.txt", "\n".join(sorted(set(idioms) | cedict_idioms)) + "\n")


if __name__ == "__main__":
    main()
