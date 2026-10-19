import asyncio

from fastapi.testclient import TestClient

from app import cambridge
from app.cambridge import back_match, parse_senses
from app.data import cedict, idioms
from app.hsk import estimate_level
from app.lookup import lookup_word
from app.main import app
from app.meaning import english_headwords, english_idiom_candidate, idiom_info, rank_senses
from app.text_processing import process_text, split_sentences

# Hand-written fixture shaped like a Cambridge English-Chinese (Simplified) entry: two senses of
# "bank", only one of which translates back to 银行.
BANK_FIXTURE = """
<div class="pr entry-body__el"><span class="pos dpos">noun</span>
  <div class="pr dsense"><h3><span class="guideword dsense_gw">(<span>ORGANIZATION</span>)</span></h3>
    <div class="def-block ddef_block">
      <div class="ddef_h"><div class="def ddef_d db">an organization where people keep their money:</div></div>
      <div class="def-body ddef_b"><span class="trans dtrans" lang="zh-Hans">银行</span>
        <div class="examp dexamp"><span class="eg deg">I need to go to the bank.</span>
          <span class="trans dtrans" lang="zh-Hans">我得去银行。</span></div></div>
    </div></div>
  <div class="pr dsense"><h3><span class="guideword dsense_gw">(<span>RIVER</span>)</span></h3>
    <div class="def-block ddef_block">
      <div class="ddef_h"><div class="def ddef_d db">sloping raised land beside a river</div></div>
      <div class="def-body ddef_b"><span class="trans dtrans" lang="zh-Hans">（河、湖等的）岸，堤</span></div>
    </div></div>
</div>
"""


def test_split_sentences_keeps_punctuation_and_newlines():
    assert split_sentences("你好！我是学生。\n“走吧？”他说") == ["你好！", "我是学生。", "\n", "“走吧？”", "他说"]


def test_process_text_segments_pinyin_and_hsk():
    by_text = {t["text"]: t for t in process_text("我在银行工作。")[0]["tokens"]}
    assert by_text["银行"]["pinyin"] == ["yín", "háng"]
    assert by_text["银行"]["hsk"] == 3
    assert by_text["。"]["is_han"] is False


def test_idioms_stay_whole():
    assert "画蛇添足" in [t["text"] for t in process_text("他这样做是画蛇添足。")[0]["tokens"]]


def test_unlisted_compound_gets_estimated_level():
    assert estimate_level("回家") == 1
    assert estimate_level("回家吧") == 2
    assert estimate_level("回𠀀") is None


def test_rank_senses_uses_pinyin_and_context():
    assert rank_senses("行", ["háng"], None, cedict())[0]["pinyin"] == "háng"
    assert rank_senses("行", ["xíng"], None, cedict())[0]["pinyin"] == "xíng"
    assert "extra effort" in rank_senses("加油", ["jiā", "yóu"], "Come on, make an extra effort!", cedict())[0]["gloss"]
    assert "refuel" in rank_senses("加油", ["jiā", "yóu"], "We need to refuel the car.", cedict())[0]["gloss"]


def test_english_headwords():
    assert english_headwords("to understand") == ["understand"]
    assert english_headwords("(fig.) to make an extra effort; to cheer sb on") == ["cheer on"]
    assert english_headwords("surname Li") == []


def test_idiom_info():
    info = idiom_info("画蛇添足", cedict(), idioms())
    assert info["literal"] == "draw legs on a snake" and "多余" in info["explanation"]
    assert english_idiom_candidate(idiom_info("一石二鸟", cedict(), idioms())) == "kill two birds with one stone"


def test_parse_and_back_match():
    senses = parse_senses(BANK_FIXTURE)
    assert [s["guideword"] for s in senses] == ["ORGANIZATION", "RIVER"]
    assert senses[0]["translation"] == "银行" and senses[0]["examples"][0]["zh"] == "我得去银行。"
    assert back_match("银行", senses[0]["translation"]) == 1
    assert back_match("银行", senses[1]["translation"]) == 0


def test_lookup_word_keeps_only_back_matched_cambridge_senses(monkeypatch):
    async def fake_fetch(url):
        return parse_senses(BANK_FIXTURE) if url.endswith("/bank") else None

    monkeypatch.setattr(cambridge, "_fetch_parsed", fake_fetch)
    info = asyncio.run(lookup_word("银行", ["yín", "háng"], None))
    mapping = info["cambridge"][0]
    assert mapping["query"] == "bank"
    assert [s["guideword"] for s in mapping["matched"]] == ["ORGANIZATION"]
    assert mapping["unmatchedCount"] == 1


def test_process_endpoint():
    with TestClient(app) as client:
        resp = client.post("/api/process", json={"text": "行不行？"})
        assert resp.status_code == 200 and resp.json()["sentences"][0]["tokens"]
