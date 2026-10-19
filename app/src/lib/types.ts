export interface Token {
  text: string;
  /** One syllable per character; empty for punctuation / non-Chinese. */
  pinyin: string[];
  /** HSK 1-6, or null when the word is outside the HSK list. */
  hsk: number | null;
  /** True when `hsk` was derived from the HSK words inside an unlisted compound. */
  hskEstimated?: boolean;
  isHan: boolean;
}

export interface Sentence {
  text: string;
  tokens: Token[];
}

export interface HskEntry {
  l: number;
  p: string;
  m: string[];
}

export interface CambridgeSense {
  definition: string;
  translation: string;
  examples: { zh: string; en: string }[];
}

export interface CambridgeEntry {
  headword: string;
  pinyin: string;
  pos: string[];
  senses: CambridgeSense[];
}

export interface DictionaryResult {
  word: string;
  found: boolean;
  entries: CambridgeEntry[];
  source_url?: string;
  error?: string;
}

export type PinyinMode = "all" | "above" | "none";

export interface ReaderSettings {
  pinyinMode: PinyinMode;
  /** With pinyinMode "above": show pinyin only for words harder than this level. */
  pinyinThreshold: number;
  colorByHsk: boolean;
  fontSize: number;
  /** Optional FastAPI backend; empty = everything runs on the device. */
  backendUrl: string;
}
