import { lookupCambridgeLocal } from "./cambridge";
import { httpRequest } from "./http";
import { processTextLocal } from "./processor";
import type { DictionaryResult, Sentence, Token } from "./types";

/**
 * Every feature works in two modes:
 *  - backendUrl empty  -> on device (jieba-wasm + pinyin-pro, native-HTTP Cambridge scraper)
 *  - backendUrl set    -> the FastAPI service in /backend (python jieba + pypinyin + BeautifulSoup)
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
  return data.sentences.map((s) => ({ text: s.text, tokens: s.tokens.map(({ is_han, hsk_estimated, ...t }) => ({ ...t, isHan: is_han, hskEstimated: hsk_estimated })) }));
}

export async function lookupWord(word: string, backendUrl: string): Promise<DictionaryResult> {
  if (!backendUrl) return lookupCambridgeLocal(word);
  const res = await httpRequest(`${backendUrl}/api/dictionary/${encodeURIComponent(word)}`);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return JSON.parse(res.data);
}

export async function translateSentence(text: string, backendUrl: string): Promise<string> {
  if (backendUrl) return (await postJson<{ translation: string }>(`${backendUrl}/api/translate`, { text })).translation;
  const url = `https://api.mymemory.translated.net/get?langpair=zh-CN|en&q=${encodeURIComponent(text)}`;
  const res = await httpRequest(url);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  const data = JSON.parse(res.data);
  if (data.responseStatus && Number(data.responseStatus) !== 200) throw new Error(data.responseDetails);
  return data.responseData.translatedText;
}
