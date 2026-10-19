# Hanzi Reader — Technical Blueprint

## 1. System architecture & data flow

```
 raw text ──► sentence splitter ──► jieba (+ HSK words + 32k idioms) ──► pinyin (sentence context) ──► HSK tag
                                                                                                        │
 tap a word ──► WordInfo pipeline (below) ──► DictionaryPopup                          InteractiveReader ◄┘
 long-press ──► sentence translation (MyMemory / LibreTranslate)
```

### Why Cambridge can't be queried with Chinese directly

Cambridge's bilingual dictionaries are indexed by **English** headwords (English → Chinese). A Chinese
word therefore has to be bridged to English first, and the English result has to be checked so we
don't show a sense of the English word that has nothing to do with the Chinese one
(银行 → "bank" → "bank of a river" is wrong).

### Word lookup pipeline (`app/src/lib/meaning.ts` ⇄ `backend/app/meaning.py`)

1. **zh → en bridge: CC-CEDICT** (120k entries, bundled). Every gloss of the word is a candidate.
2. **Rank glosses for this occurrence**
   * *reading*: the context pinyin of the token picks the right entry of a polyphone (行 háng = row/firm, xíng = walk/OK);
   * *context*: the sentence is machine-translated once (cached) and glosses sharing content words with
     that translation are boosted (加油 in "make an extra effort" vs "refuel the car"; 打 "hit" vs "phone call");
   * bound-form / literary / variant / surname glosses are demoted.
3. **Glosses → English headwords**: "to cheer sb on" → `cheer on`, "row; line" → `row`, `line`. Long
   explanatory glosses produce no query. Only senses within 0.5 of the best score are used, so an
   off-context sense never reaches Cambridge.
4. **Cambridge back-mapping**: look up `/dictionary/english-chinese-simplified/{headword}` and score every
   sense by whether *Cambridge's own Chinese translation* maps back to the original word
   (exact = 1, contains = 0.9, partial character overlap ≤ 0.5). Only senses ≥ 0.5 are shown, with their
   guideword, English definition, Chinese translation and examples. If none match, the popup says so
   instead of showing a misleading definition.
5. **Idioms / set phrases (成语) take a different path** – word-by-word mapping is meaningless for them:
   * CC-CEDICT's idiom glosses, split into *literal* ("draw legs on a snake") and *figurative* meaning;
   * the **Xinhua idiom dictionary** (新华成语词典, 30k idioms) Chinese explanation (释义);
   * if CC-CEDICT gives an English idiom equivalent (一石二鸟 → "kill two birds with one stone"), its
     entry in the Cambridge *English* dictionary.
   Idioms are added to jieba so they stay one token; if a phrase is still split, `findEnclosingPhrase`
   detects the longer dictionary phrase around the tapped token and the popup offers it.

| Source | Used for | Licence |
|---|---|---|
| CC-CEDICT (via `cedict-json`) | zh → en senses, classifiers, idiom lit./fig. | CC BY-SA 4.0 |
| Xinhua idiom dictionary (`pwxcoo/chinese-xinhua`) | idiom detection + Chinese explanation | MIT |
| HSK 2.0 lists (`drkameleon/complete-hsk-vocabulary`) | levels, colour coding | MIT |
| Cambridge English-Chinese / English | verified definitions + examples, fetched live per tap | site terms; not redistributed |
| MyMemory (or LibreTranslate) | sentence translation and ranking context | API terms |

### Token model & HSK

`{ text, pinyin: string[] (per character), hsk: 1-6 | null, hskEstimated, isHan }`. Pinyin is per
character so `<ruby>` keeps each syllable above its hanzi. Unlisted compounds (一个, 回家吧) get the
hardest level among their HSK sub-words, flagged `≈`. The HSK filter shows pinyin for all words, none,
or only words above a chosen level; colour coding is independent.

## 2. Backend (`backend/app`)

* `text_processing.py` – `POST /api/process {text}` → `{sentences:[{text,tokens}]}`.
* `GET /api/word/{word}?pinyin=…&sentence=…` – the full pipeline above (`meaning.py`, `lookup.py`),
  returning the same `WordInfo` JSON the app builds on device.
* `cambridge.py` – English-Chinese lookups + back-matching, English idiom lookups. Browser-like headers,
  rotating UA, concurrency 2, ≥0.5 s between upstream calls, backoff honouring `Retry-After` on
  403/429/5xx, 24 h TTL cache of parsed results. Selectors cover current (`ddef_d`, `dsense_gw`, `dtrans`)
  and older class names. `python -m app.smoke` checks the live site (run in CI).
* `translate.py` – `POST /api/translate {text}`.
* CORS: `CORS_ORIGINS` env var, defaults include `https://localhost` and `capacitor://localhost`
  (the Capacitor WebView origins) and `http://localhost:3000` (dev server).

## 3. Frontend (`app/src`)

* `components/InteractiveReader.tsx` – memoised `Word` components; tap = dictionary, long-press = sentence translation.
* `components/DictionaryPopup.tsx` – bottom sheet: meaning in this sentence (with the reason it was chosen), idiom panel, back-matched Cambridge senses, other senses, enclosing-phrase chip, "translate sentence".
* `components/HskFilter.tsx` – pinyin mode, threshold slider, colour toggle, font size, backend URL.
* `lib/processor.ts`, `lib/meaning.ts`, `lib/lookup.ts`, `lib/cambridge.ts`, `lib/http.ts` – on-device pipeline.

## 4. Edge cases & limitations

| Issue | Mitigation |
|---|---|
| **Polyphones** (行 xíng/háng, 长 cháng/zhǎng, 了 le/liǎo, 一/不 tone sandhi) | Pinyin is computed with context (whole sentence on device; whole word with pypinyin's phrase dictionary on the backend). Rare literary readings can still be wrong; the popup also shows the dictionary reading. |
| **Segmentation errors** (names, web-novel slang, 修仙 terms) | All HSK words are added to jieba's dictionary. Character names are often split; future work: user dictionary (`add_word`) from long-press. |
| **Cambridge has no API / may block** | Native or server-side requests only, throttle + cache + backoff. When blocked, CC-CEDICT still answers. HTML redesigns: fallback selectors + the CI smoke test; update both parsers together (shared fixture tests). |
| **zh → en → Cambridge drifts in meaning** | Back-mapping through Cambridge's own Chinese translation; senses that don't map back are hidden, not guessed. |
| **Context ranking depends on machine translation** | MT is only a ranking signal; the displayed meaning is always a dictionary gloss. Without MT, ranking falls back to reading + dictionary order. |
| **Web-novel slang, names, 修仙 terms** | Often missing from every source; the popup says so and offers sentence translation. |
| **Terms of use** | Lookups are per user tap and cached; nothing is redistributed. Don't bulk-crawl. |
| **Translation quota** | MyMemory's free tier is ~5k chars/day per IP; set `MYMEMORY_EMAIL` or switch the backend to LibreTranslate. |
| **Traditional characters** | HSK list is simplified; traditional text segments and gets pinyin but mostly shows as "outside HSK". |
| **Large chapters** | Processing is per sentence and the `Word` component is memoised; extremely long pastes (>100k chars) should be paginated. |
| **HSK version** | Uses HSK 2.0 (levels 1-6) as requested; HSK 3.0 (1-9) can be swapped in by changing the source path in `scripts/build_hsk_data.py`. |
