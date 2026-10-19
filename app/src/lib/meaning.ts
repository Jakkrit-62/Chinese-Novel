/**
 * Chinese word -> ranked English meanings.
 *
 * Cambridge's dictionaries are indexed by *English* headwords, so a Chinese word cannot be
 * looked up there directly. The pipeline is:
 *   1. CC-CEDICT gives every English gloss of the Chinese word (the zh -> en bridge).
 *   2. Glosses are ranked for *this* occurrence: the reading from context pinyin (行 háng vs xíng)
 *      and overlap with a machine translation of the whole sentence.
 *   3. The top glosses are turned into English headwords ("to understand" -> "understand").
 *   4. cambridge.ts looks those up in Cambridge English-Chinese and keeps only the senses whose
 *      Chinese translation maps back to the original word (bank/银行 yes, bank/河岸 no).
 * Idioms (成语) skip step 3-4 and use CC-CEDICT's lit./fig. glosses + the Xinhua explanation.
 *
 * Keep in sync with backend/app/meaning.py.
 */
import type { Cedict, Idioms } from "./dict";
import type { IdiomInfo, RankedSense } from "./types";

const SKIP_GLOSS = /^(surname |used in |variant of |old variant of |see |Taiwan pr\.|also pr\.|also written |abbr\. for )/;
const STOPWORDS = new Set(
  "a an the to of in on at for by with from as and or be is are was were it its this that sb sth one oneself someone something etc".split(" "),
);

export const stripTones = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ü/g, "v");
const normPinyin = (s: string) => s.toLowerCase().replace(/\s+/g, "");

export function stem(word: string): string {
  const w = word.toLowerCase();
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) return w.slice(0, -suffix.length);
  }
  return w;
}

export function contentStems(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => !STOPWORDS.has(w) && w.length > 1).map(stem),
  );
}

/**
 * "to cheer sb on (fig.)" -> ["cheer on"]; "row; line" -> ["row", "line"]. Max 3 words each.
 * Long descriptive glosses ("a semantically light verb that ...") are explanations, not
 * translations, and yield nothing.
 */
export function englishHeadwords(gloss: string): string[] {
  if (SKIP_GLOSS.test(gloss) || gloss.length > 80) return [];
  const out: string[] = [];
  for (const part of gloss.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").split(";")) {
    const words = part
      .toLowerCase()
      .replace(/[^a-z' -]/g, " ")
      .split(/\s+/)
      .filter((w) => w && w !== "sb" && w !== "sth" && w !== "sb's" && w !== "sth's");
    while (words.length && ["to", "a", "an", "the", "be"].includes(words[0])) words.shift();
    if (words.length && words.length <= 3) out.push(words.join(" "));
  }
  return out;
}

export function splitLitFig(gloss: string): { literal: string | null; figurative: string | null } {
  const m = gloss.match(/lit\.\s*(.+?)\s*(?:\(idiom\))?\s*;\s*fig\.\s*(.+)/i);
  return m ? { literal: m[1].trim(), figurative: m[2].trim() } : { literal: null, figurative: null };
}

export function rankSenses(
  word: string,
  tokenPinyin: string[],
  context: string | null,
  cedict: Cedict,
): RankedSense[] {
  const entries = cedict[word] ?? [];
  const target = normPinyin(tokenPinyin.join(""));
  const multipleReadings = new Set(entries.map((e) => stripTones(normPinyin(e[0])))).size > 1 ||
    new Set(entries.map((e) => normPinyin(e[0]))).size > 1;
  const ctx = context ? contentStems(context) : null;
  const ranked: RankedSense[] = [];
  let order = 0;
  for (const [pinyin, glosses, classifiers] of entries) {
    for (const gloss of glosses) {
      const reasons: string[] = [];
      let score = -0.01 * order++;
      if (target && multipleReadings) {
        if (normPinyin(pinyin) === target) {
          score += 3;
          reasons.push("pinyin");
        } else if (stripTones(normPinyin(pinyin)) === stripTones(target)) {
          score += 2; // tone sandhi (一 yí / 不 bú) or a neutral-tone variant
          reasons.push("pinyin");
        }
      }
      if (ctx) {
        const hits = [...contentStems(gloss.replace(/\([^)]*\)/g, " "))].filter((w) => ctx.has(w));
        if (hits.length) {
          score += 2 * hits.length;
          reasons.push(`context:${hits.join(",")}`);
        }
      }
      if (SKIP_GLOSS.test(gloss)) score -= 4;
      if (/\((bound form|literary|archaic|old|Tw|dialect)\)/.test(gloss)) score -= 0.5;
      ranked.push({ pinyin, gloss, classifiers, score, reasons });
    }
  }
  return ranked.sort((a, b) => b.score - a.score);
}

export function idiomInfo(word: string, cedict: Cedict, idioms: Idioms): IdiomInfo | null {
  const xinhua = idioms[word];
  const english = (cedict[word] ?? []).flatMap((e) => e[1]);
  const isIdiom = !!xinhua || english.some((g) => g.includes("(idiom)"));
  if (!isIdiom) return null;
  const litFig = english.map(splitLitFig).find((x) => x.literal) ?? { literal: null, figurative: null };
  return {
    pinyin: xinhua?.p ?? cedict[word]?.[0]?.[0] ?? "",
    explanation: xinhua?.x ?? null,
    ...litFig,
    english: english.map((g) => g.replace(/\s*\(idiom\)\s*/g, " ").trim()),
  };
}

/** English phrase worth trying as a Cambridge *English* idiom entry, e.g. "kill two birds with one stone". */
export function englishIdiomCandidate(idiom: IdiomInfo): string | null {
  for (const g of [idiom.figurative, ...idiom.english]) {
    if (!g || /^lit\./.test(g)) continue;
    const phrase = g.split(";")[0].replace(/\([^)]*\)/g, "").replace(/^\s*to\s+/i, "").trim().toLowerCase();
    if (phrase.split(/\s+/).length >= 3 && /^[a-z' -]+$/.test(phrase)) return phrase;
  }
  return null;
}

/**
 * Longest dictionary phrase (CC-CEDICT word or idiom) made of whole neighbouring tokens that
 * contains the tapped token - catches idioms jieba split apart (一石 / 二鸟).
 */
export function findEnclosingPhrase(
  tokens: string[],
  index: number,
  cedict: Cedict,
  idioms: Idioms,
  maxChars = 8,
): { text: string; start: number; end: number } | null {
  let best: { text: string; start: number; end: number } | null = null;
  for (let start = Math.max(0, index - 4); start <= index; start++) {
    let text = tokens.slice(start, index).join("");
    for (let end = index; end < Math.min(tokens.length, index + 5); end++) {
      text += tokens[end];
      if (Array.from(text).length > maxChars) break;
      if (end === start) continue; // single token = the word itself
      if ((cedict[text] || idioms[text]) && (!best || text.length > best.text.length)) {
        best = { text, start, end };
      }
    }
  }
  return best;
}
