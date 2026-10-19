/** On-device word lookup: CC-CEDICT ranking + idiom sources + Cambridge back-mapping. */
import { lookupEnglishIdiom, mapToCambridge } from "./cambridge";
import { loadCedict, loadIdioms } from "./dict";
import { englishHeadwords, englishIdiomCandidate, idiomInfo, rankSenses } from "./meaning";
import type { WordInfo } from "./types";

const MAX_QUERIES = 3;
/** Only senses this close to the best one may be sent to Cambridge (avoid off-context meanings). */
const TOP_TIER = 0.5;

/** Senses + idiom info only (instant, no network). */
export async function resolveLocal(word: string, pinyin: string[], context: string | null): Promise<WordInfo> {
  const [cedict, idioms] = await Promise.all([loadCedict(), loadIdioms()]);
  return {
    word,
    senses: rankSenses(word, pinyin, context, cedict),
    idiom: idiomInfo(word, cedict, idioms),
    cambridge: [],
    cambridgeIdiom: null,
    context,
  };
}

/** Adds Cambridge data to a resolved word: English idiom page for 成语, back-mapped senses otherwise. */
export async function withCambridge(info: WordInfo): Promise<WordInfo> {
  const cedict = await loadCedict();
  if (info.idiom) {
    const phrase = englishIdiomCandidate(info.idiom);
    return { ...info, cambridgeIdiom: phrase ? await lookupEnglishIdiom(phrase) : null };
  }
  // English headwords from the top-ranked senses only, deduplicated.
  const best = info.senses[0]?.score ?? 0;
  const top = info.senses.filter((s) => s.score >= best - TOP_TIER);
  const meaning = new Set(top.flatMap((s) => englishHeadwords(s.gloss)));
  const queries: { headword: string; gloss: string }[] = [];
  for (const sense of top) {
    for (const headword of englishHeadwords(sense.gloss)) {
      if (!queries.some((q) => q.headword === headword)) queries.push({ headword, gloss: sense.gloss });
    }
  }
  const cambridge = [];
  for (const q of queries.slice(0, MAX_QUERIES)) {
    cambridge.push({ ...(await mapToCambridge(info.word, q.headword, meaning, cedict)), gloss: q.gloss });
  }
  // Most useful first: mappings with back-matched senses, by best match.
  cambridge.sort((a, b) => (b.matched[0]?.match ?? -1) - (a.matched[0]?.match ?? -1));
  return { ...info, cambridge };
}
