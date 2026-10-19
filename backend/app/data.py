"""Bundled dictionaries built by scripts/build_data.py (repo-root /data, override with DATA_DIR)."""
import json
import os
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parents[2] / "data"))


def _load(name: str):
    return json.loads((DATA_DIR / name).read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def hsk_table() -> dict[str, dict]:
    return _load("hsk.json")


@lru_cache(maxsize=1)
def cedict() -> dict[str, list]:
    return _load("cedict.json")


@lru_cache(maxsize=1)
def idioms() -> dict[str, dict]:
    return _load("idioms.json")


@lru_cache(maxsize=1)
def phrases() -> list[str]:
    return [p for p in (DATA_DIR / "phrases.txt").read_text(encoding="utf-8").splitlines() if p]
