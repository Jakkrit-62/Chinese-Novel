"""Chinese word -> ranked English meanings. Python port of app/src/lib/meaning.ts (keep in sync).

Cambridge is indexed by English headwords, so the bridge is CC-CEDICT: its glosses are ranked
for the current sentence (context pinyin + overlap with a sentence translation), turned into
English headwords, and cambridge.py keeps only Cambridge senses that translate back to the word.
Idioms use CC-CEDICT lit./fig. glosses and the Xinhua idiom explanation instead.
"""
import re
import unicodedata

SKIP_GLOSS = re.compile(r"^(surname |used in |variant of |old variant of |see |Taiwan pr\.|also pr\.|also written |abbr\. for )")
STOPWORDS = set(
    "a an the to of in on at for by with from as and or be is are was were it its this that sb sth one oneself "
    "someone something etc".split()
)
MARKED = re.compile(r"\((bound form|literary|archaic|old|Tw|dialect)\)")


def strip_tones(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c)).replace("ü", "v")


def _norm(s: str) -> str:
    return re.sub(r"\s+", "", s.lower())


def stem(word: str) -> str:
    w = word.lower()
    for suffix in ("ing", "ed", "es", "s"):
        if len(w) > len(suffix) + 2 and w.endswith(suffix):
            return w[: -len(suffix)]
    return w


def content_stems(text: str) -> set[str]:
    return {stem(w) for w in re.findall(r"[a-z']+", text.lower()) if w not in STOPWORDS and len(w) > 1}


def english_headwords(gloss: str) -> list[str]:
    if SKIP_GLOSS.match(gloss) or len(gloss) > 80:
        return []
    out = []
    for part in re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", gloss).split(";"):
        words = [w for w in re.sub(r"[^a-z' -]", " ", part.lower()).split() if w not in ("sb", "sth", "sb's", "sth's")]
        while words and words[0] in ("to", "a", "an", "the", "be"):
            words.pop(0)
        if words and len(words) <= 3:
            out.append(" ".join(words))
    return out


def split_lit_fig(gloss: str) -> tuple[str | None, str | None]:
    m = re.search(r"lit\.\s*(.+?)\s*(?:\(idiom\))?\s*;\s*fig\.\s*(.+)", gloss, re.I)
    return (m.group(1).strip(), m.group(2).strip()) if m else (None, None)


def rank_senses(word: str, token_pinyin: list[str], context: str | None, cedict: dict) -> list[dict]:
    entries = cedict.get(word, [])
    target = _norm("".join(token_pinyin))
    multiple = len({strip_tones(_norm(e[0])) for e in entries}) > 1 or len({_norm(e[0]) for e in entries}) > 1
    ctx = content_stems(context) if context else None
    ranked, order = [], 0
    for pinyin, glosses, classifiers in entries:
        for gloss in glosses:
            reasons, score = [], -0.01 * order
            order += 1
            if target and multiple:
                if _norm(pinyin) == target:
                    score += 3
                    reasons.append("pinyin")
                elif strip_tones(_norm(pinyin)) == strip_tones(target):
                    score += 2
                    reasons.append("pinyin")
            if ctx:
                hits = sorted(content_stems(re.sub(r"\([^)]*\)", " ", gloss)) & ctx)
                if hits:
                    score += 2 * len(hits)
                    reasons.append("context:" + ",".join(hits))
            if SKIP_GLOSS.match(gloss):
                score -= 4
            if MARKED.search(gloss):
                score -= 0.5
            ranked.append({"pinyin": pinyin, "gloss": gloss, "classifiers": classifiers, "score": score, "reasons": reasons})
    return sorted(ranked, key=lambda s: -s["score"])


def idiom_info(word: str, cedict: dict, idioms: dict) -> dict | None:
    xinhua = idioms.get(word)
    english = [g for e in cedict.get(word, []) for g in e[1]]
    if not xinhua and not any("(idiom)" in g for g in english):
        return None
    literal, figurative = next((lf for lf in map(split_lit_fig, english) if lf[0]), (None, None))
    return {
        "pinyin": xinhua["p"] if xinhua else (cedict[word][0][0] if word in cedict else ""),
        "explanation": xinhua["x"] if xinhua else None,
        "literal": literal,
        "figurative": figurative,
        "english": [re.sub(r"\s*\(idiom\)\s*", " ", g).strip() for g in english],
    }


def english_idiom_candidate(idiom: dict) -> str | None:
    for g in [idiom["figurative"], *idiom["english"]]:
        if not g or g.startswith("lit."):
            continue
        phrase = re.sub(r"^\s*to\s+", "", re.sub(r"\([^)]*\)", "", g.split(";")[0]), flags=re.I).strip().lower()
        if len(phrase.split()) >= 3 and re.fullmatch(r"[a-z' -]+", phrase):
            return phrase
    return None
