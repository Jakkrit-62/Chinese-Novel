// Same hand-written fixture as backend/tests/test_backend.py, so both parsers stay in sync.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Window } from "happy-dom";
import { backMatch, parseSenses } from "./cambridge";

(globalThis as unknown as { DOMParser: unknown }).DOMParser = new Window().DOMParser;

const BANK_FIXTURE = `
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
`;

test("parses guideword, definition, Chinese translation and examples", () => {
  const { pos, senses } = parseSenses(BANK_FIXTURE);
  assert.equal(pos, "noun");
  assert.deepEqual(senses.map((s) => s.guideword), ["ORGANIZATION", "RIVER"]);
  assert.equal(senses[0].definition, "an organization where people keep their money");
  assert.equal(senses[0].translation, "银行");
  assert.deepEqual(senses[0].examples[0], { en: "I need to go to the bank.", zh: "我得去银行。" });
  assert.equal(backMatch("银行", senses[0].translation), 1);
  assert.equal(backMatch("银行", senses[1].translation), 0);
});
