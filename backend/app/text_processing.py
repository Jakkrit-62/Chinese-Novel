"""Segmentation (jieba) + pinyin (pypinyin) + HSK tagging."""
import re
from dataclasses import asdict, dataclass

import jieba
from pypinyin import Style, pinyin

from .data import phrases
from .hsk import estimate_level, hsk_level, hsk_table

HAN_RE = re.compile(r"[㐀-䶿一-鿿豈-﫿\U00020000-\U0002ebef]")
# Sentence ends at Chinese/Western terminal punctuation, keeping closing quotes/brackets with it.
SENTENCE_RE = re.compile(r"[^。！？!?…\n]*(?:[。！？!?…]+[”」』）)\"']*|\n|$)")

_initialised = False


def _init_jieba() -> None:
    """Teach jieba every HSK word and idiom so it never splits them."""
    global _initialised
    if _initialised:
        return
    for word in hsk_table():
        if len(word) > 1:
            jieba.add_word(word)
    for phrase in phrases():
        jieba.add_word(phrase)
    _initialised = True


@dataclass
class Token:
    text: str
    pinyin: list[str]  # one syllable per character; empty for non-Chinese tokens
    hsk: int | None  # 1-6, None = not in HSK list
    is_han: bool
    hsk_estimated: bool = False  # level derived from the HSK words inside an unlisted compound


def split_sentences(text: str) -> list[str]:
    return [s for s in SENTENCE_RE.findall(text) if s]


def tokenize_sentence(sentence: str) -> list[Token]:
    _init_jieba()
    tokens: list[Token] = []
    for word in jieba.cut(sentence, HMM=True):
        if not HAN_RE.search(word):
            tokens.append(Token(word, [], None, False))
            continue
        # pypinyin uses its phrase dictionary on the whole word, which resolves most
        # polyphones (银行 háng vs 行走 xíng). neutral_tone_with_five=False keeps tone marks.
        syllables = [p[0] for p in pinyin(word, style=Style.TONE, heteronym=False, errors=lambda x: list(x))]
        level = hsk_level(word)
        estimated = level is None and len(word) > 1
        if estimated:
            level = estimate_level(word)
        tokens.append(Token(word, syllables, level, True, estimated and level is not None))
    return tokens


def process_text(text: str) -> list[dict]:
    """Return [{text, tokens:[...]}] - one item per sentence, newlines kept as their own sentence."""
    return [
        {"text": s, "tokens": [asdict(t) for t in tokenize_sentence(s)]}
        for s in split_sentences(text.replace("\r\n", "\n"))
    ]
