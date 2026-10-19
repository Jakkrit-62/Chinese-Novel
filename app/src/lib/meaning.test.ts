// Run: npm test   (uses the real bundled data from /data)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { backMatch } from "./cambridge";
import type { Cedict, Idioms } from "./dict";
import { englishHeadwords, englishIdiomCandidate, findEnclosingPhrase, idiomInfo, rankSenses } from "./meaning";

const cedict: Cedict = JSON.parse(readFileSync(new URL("../../../data/cedict.json", import.meta.url), "utf8"));
const idioms: Idioms = JSON.parse(readFileSync(new URL("../../../data/idioms.json", import.meta.url), "utf8"));

test("context pinyin picks the right reading of a polyphone", () => {
  assert.equal(rankSenses("行", ["xíng"], null, cedict)[0].pinyin, "xíng");
  assert.equal(rankSenses("行", ["háng"], null, cedict)[0].pinyin, "háng");
  assert.equal(rankSenses("长", ["zhǎng"], null, cedict)[0].pinyin, "zhǎng");
});

test("sentence translation re-ranks senses of a polysemous word", () => {
  const ranked = rankSenses("加油", ["jiā", "yóu"], "Come on, make an extra effort!", cedict);
  assert.match(ranked[0].gloss, /extra effort/);
  assert.ok(ranked[0].reasons.some((r) => r.startsWith("context:")));
  assert.match(rankSenses("加油", ["jiā", "yóu"], "We need to refuel the car.", cedict)[0].gloss, /refuel/);
});

test("glosses become Cambridge-searchable English headwords", () => {
  assert.deepEqual(englishHeadwords("to understand"), ["understand"]);
  assert.deepEqual(englishHeadwords("(fig.) to make an extra effort; to cheer sb on"), ["cheer on"]);
  assert.deepEqual(englishHeadwords("(bound form) row; line"), ["row", "line"]);
  assert.deepEqual(englishHeadwords("a semantically light, transitive verb that is combined with various objects to form compound verbs"), []);
  assert.deepEqual(englishHeadwords("surname Li"), []);
});

test("Cambridge senses are kept only if their Chinese maps back to the word", () => {
  assert.equal(backMatch("银行", "银行"), 1); // bank (ORGANIZATION)
  assert.equal(backMatch("银行", "（河、湖等的）岸，堤"), 0); // bank (RIVER)
  assert.equal(backMatch("了解", "理解；明白"), 0.25);
  assert.ok(backMatch("了解", "了解，理解") >= 0.9);
});

test("idioms use CC-CEDICT lit./fig. and the Xinhua explanation", () => {
  const info = idiomInfo("画蛇添足", cedict, idioms)!;
  assert.equal(info.literal, "draw legs on a snake");
  assert.match(info.figurative!, /superfluous/);
  assert.match(info.explanation!, /多余/);
  assert.equal(englishIdiomCandidate(idiomInfo("一石二鸟", cedict, idioms)!), "kill two birds with one stone");
  assert.equal(idiomInfo("银行", cedict, idioms), null);
});

test("a phrase split across tokens is found from any of its tokens", () => {
  const tokens = ["他", "这样", "做", "是", "一石", "二鸟", "。"];
  assert.deepEqual(findEnclosingPhrase(tokens, 5, cedict, idioms), { text: "一石二鸟", start: 4, end: 5 });
  assert.equal(findEnclosingPhrase(["我", "是", "学生"], 2, cedict, idioms)?.text ?? null, null);
});
