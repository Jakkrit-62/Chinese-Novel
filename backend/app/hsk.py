"""HSK 1-6 lookup table (word -> level, pinyin, short CC-CEDICT meanings)."""
from .data import hsk_table


def hsk_level(word: str) -> int | None:
    entry = hsk_table().get(word)
    return entry["l"] if entry else None


def estimate_level(word: str) -> int | None:
    """Level for a compound jieba kept whole but HSK doesn't list (一个, 回家, 大雨): split it
    greedily into HSK words and take the hardest part. None if any piece is outside HSK."""
    table, i, level = hsk_table(), 0, 0
    while i < len(word):
        for size in range(min(4, len(word) - i), 0, -1):
            piece = word[i : i + size]
            if piece in table:
                level = max(level, table[piece]["l"])
                i += size
                break
        else:
            return None
    return level or None


def hsk_entry(word: str) -> dict | None:
    return hsk_table().get(word)
