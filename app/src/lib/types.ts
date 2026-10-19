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

/** One English gloss from CC-CEDICT, scored for the current context. */
export interface RankedSense {
  pinyin: string;
  gloss: string;
  classifiers: string[];
  score: number;
  /** Why it ranked where it did, e.g. ["pinyin", "context:bank"]. */
  reasons: string[];
}

export interface IdiomInfo {
  pinyin: string;
  /** Chinese explanation (释义) from the Xinhua idiom dictionary. */
  explanation: string | null;
  /** CC-CEDICT "lit. ...; fig. ..." split into its two halves when present. */
  literal: string | null;
  figurative: string | null;
  english: string[];
}

export interface CambridgeSense {
  guideword: string;
  pos: string;
  definition: string;
  /** Cambridge's own Chinese translation of this English sense. */
  translation: string;
  examples: { en: string; zh: string }[];
  /** 0-1: how well `translation` maps back to the Chinese word we started from. */
  match: number;
}

/** Result of looking up one English headword in Cambridge English-Chinese (Simplified). */
export interface CambridgeMapping {
  query: string;
  /** The CC-CEDICT gloss the English query came from. */
  gloss?: string;
  url: string;
  found: boolean;
  /** Senses whose Chinese translation matches the original word, best first. */
  matched: CambridgeSense[];
  unmatchedCount: number;
}

export interface CambridgeIdiom {
  phrase: string;
  url: string;
  definitions: string[];
}

export interface WordInfo {
  word: string;
  senses: RankedSense[];
  idiom: IdiomInfo | null;
  cambridge: CambridgeMapping[];
  cambridgeIdiom: CambridgeIdiom | null;
  /** Sentence translation that was used to rank senses (null if unavailable). */
  context: string | null;
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
