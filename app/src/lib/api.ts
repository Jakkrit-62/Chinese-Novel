import { httpRequest } from "./http";
import { resolveLocal, withCambridge } from "./lookup";
import { processTextLocal } from "./processor";
import type { Sentence, Token, WordInfo } from "./types";

/**
 * Every feature works in two modes:
 *  - backendUrl empty  -> on device (jieba-wasm + pinyin-pro, bundled CC-CEDICT, native-HTTP Cambridge)
 *  - backendUrl set    -> the FastAPI service in /backend (same pipeline in Python)
 */
async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await httpRequest(url, { method: "POST", json: body });
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return JSON.parse(res.data);
}

export async function processText(text: string, backendUrl: string): Promise<Sentence[]> {
  if (!backendUrl) return processTextLocal(text);
  type ApiToken = Omit<Token, "isHan" | "hskEstimated"> & { is_han: boolean; hsk_estimated: boolean };
  const data = await postJson<{ sentences: { text: string; tokens: ApiToken[] }[] }>(
    `${backendUrl}/api/process`,
    { text },
  );
  return data.sentences.map((s) => ({
    text: s.text,
    tokens: s.tokens.map(({ is_han, hsk_estimated, ...t }) => ({ ...t, isHan: is_han, hskEstimated: hsk_estimated })),
  }));
}

const translations = new Map<string, Promise<string>>();

/** Sentence translation, cached per sentence (it is also the context for ranking word senses). */
export function translateSentence(text: string, backendUrl: string): Promise<string> {
  const key = `${backendUrl}|${text.trim()}`;
  if (!translations.has(key)) {
    const p = backendUrl
      ? postJson<{ translation: string }>(`${backendUrl}/api/translate`, { text: text.trim() }).then((d) => d.translation)
      : translateMyMemory(text.trim());
    p.catch(() => translations.delete(key));
    translations.set(key, p);
  }
  return translations.get(key)!;
}

async function translateMyMemory(text: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?langpair=zh-CN|en&q=${encodeURIComponent(text)}`;
  const res = await httpRequest(url);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const data = JSON.parse(res.data);
  if (data.responseStatus && Number(data.responseStatus) !== 200) throw new Error(data.responseDetails);
  return data.responseData.translatedText;
}

/**
 * Look a word up in its sentence. Calls `onUpdate` progressively:
 * dictionary senses (instant) -> re-ranked with the sentence translation -> Cambridge mappings.
 */
export async function lookupWord(
  word: string,
  pinyin: string[],
  sentence: string,
  backendUrl: string,
  onUpdate: (info: WordInfo) => void,
): Promise<void> {
  if (backendUrl) {
    const qs = new URLSearchParams({ pinyin: pinyin.join(" "), sentence });
    const res = await httpRequest(`${backendUrl}/api/word/${encodeURIComponent(word)}?${qs}`);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    onUpdate(JSON.parse(res.data));
    return;
  }
  let info = await resolveLocal(word, pinyin, null);
  onUpdate(info);
  const context = await translateSentence(sentence, backendUrl).catch(() => null);
  if (context) {
    info = await resolveLocal(word, pinyin, context);
    onUpdate(info);
  }
  try {
    onUpdate(await withCambridge(info));
  } catch (e) {
    onUpdate({ ...info, error: String((e as Error)?.message ?? e) });
  }
}
