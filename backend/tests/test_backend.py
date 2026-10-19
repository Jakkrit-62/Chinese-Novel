from fastapi.testclient import TestClient

from app.cambridge import parse_entry_html
from app.hsk import estimate_level
from app.main import app
from app.text_processing import process_text, split_sentences

# Hand-written fixture shaped like Cambridge's Chinese-English entry markup.
CAMBRIDGE_FIXTURE = """
<div class="pr entry-body__el">
  <div class="pos-header"><span class="headword"><span class="hw dhw">银行</span></span>
    <span class="pinyin">yín háng</span><span class="pos dpos">noun</span></div>
  <div class="def-block ddef_block">
    <div class="def ddef_d">bank</div>
    <div class="def-body ddef_b">
      <div class="examp dexamp"><span class="eg deg">我去银行取钱。</span>
        <span class="trans dtrans">I'm going to the bank to withdraw money.</span></div>
    </div>
  </div>
</div>
"""


def test_split_sentences_keeps_punctuation_and_newlines():
    assert split_sentences("你好！我是学生。\n“走吧？”他说") == ["你好！", "我是学生。", "\n", "“走吧？”", "他说"]


def test_process_text_segments_pinyin_and_hsk():
    tokens = process_text("我在银行工作。")[0]["tokens"]
    by_text = {t["text"]: t for t in tokens}
    assert by_text["银行"]["pinyin"] == ["yín", "háng"]  # polyphone 行 resolved by word context
    assert by_text["银行"]["hsk"] == 3
    assert by_text["我"]["hsk"] == 1
    assert by_text["。"]["is_han"] is False


def test_unlisted_compound_gets_estimated_level():
    assert estimate_level("回家") == 1  # 回 (1) + 家 (1)
    assert estimate_level("回家吧") == 2  # 吧 is HSK 2
    assert estimate_level("回𠀀") is None
    token = process_text("我们回家吧。")[0]["tokens"][1]
    assert token["hsk"] is not None and token["hsk_estimated"] is True


def test_parse_cambridge_entry():
    result = parse_entry_html(CAMBRIDGE_FIXTURE, "银行")
    assert result["found"]
    entry = result["entries"][0]
    assert entry["headword"] == "银行" and entry["pinyin"] == "yín háng" and entry["pos"] == ["noun"]
    assert entry["senses"][0]["definition"] == "bank"
    assert entry["senses"][0]["examples"][0]["en"].startswith("I'm going")


def test_parse_cambridge_no_entry():
    assert parse_entry_html("<html><body>spellcheck</body></html>", "xx")["found"] is False


def test_process_endpoint():
    with TestClient(app) as client:
        resp = client.post("/api/process", json={"text": "行不行？"})
        assert resp.status_code == 200
        assert resp.json()["sentences"][0]["tokens"][0]["text"]
