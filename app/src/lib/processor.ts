import initJieba, { add_word, cut } from "jieba-wasm/web";
import { pinyin } from "pinyin-pro";
import { estimateLevel, loadHsk } from "./hsk";
import type { Sentence, Token } from "./types";

const HAN = /[㐀-䶿一-鿿豈-﫿\u{20000}-\u{2ebef}]/u;
// Same rule as the backend: split after terminal punctuation (keeping closing quotes), and on newlines.
const SENTENCE = /[^。！？!?…\n]*(?:[。！？!?…]+[”」』）)"']*|\n|$)/g;

let ready: Promise<void> | null = null;

/** Load the jieba WASM module and teach it every HSK word so study words are never split. */
function init(): Promise<void> {
  ready ??= (async () => {
    await initJieba({ module_or_path: "/jieba_rs_wasm_bg.wasm" });
    const hsk = await loadHsk();
    for (const word of Object.keys(hsk)) if (word.length > 1) add_word(word);
  })();
  return ready;
}

export function splitSentences(text: string): string[] {
  return (text.replace(/\r\n/g, "\n").match(SENTENCE) ?? []).filter(Boolean);
}

/**
 * Tokenise a sentence with jieba, then attach pinyin computed over the *whole sentence*
 * (pinyin-pro uses surrounding context to pick the reading of polyphones like 行/长/了),
 * mapped back onto each token by code-point offset.
 */
async function tokenizeSentence(sentence: string, hsk: Awaited<ReturnType<typeof loadHsk>>): Promise<Token[]> {
  const syllables = pinyin(sentence, { type: "array", toneType: "symbol" });
  const tokens: Token[] = [];
  let offset = 0;
  for (const word of cut(sentence, true)) {
    const len = Array.from(word).length;
    const isHan = HAN.test(word);
    const listed = isHan ? (hsk[word]?.l ?? null) : null;
    const estimated = isHan && listed === null && len > 1 ? estimateLevel(word, hsk) : null;
    tokens.push({
      text: word,
      pinyin: isHan ? syllables.slice(offset, offset + len) : [],
      hsk: listed ?? estimated,
      hskEstimated: estimated !== null,
      isHan,
    });
    offset += len;
  }
  return tokens;
}

export async function processTextLocal(text: string): Promise<Sentence[]> {
  await init();
  const hsk = await loadHsk();
  const out: Sentence[] = [];
  for (const s of splitSentences(text)) out.push({ text: s, tokens: await tokenizeSentence(s, hsk) });
  return out;
}
