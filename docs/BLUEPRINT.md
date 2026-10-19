# Hanzi Reader — Technical Blueprint

## 1. System architecture & data flow

```
 raw text ──► sentence splitter ──► jieba segmentation ──► pinyin (sentence context) ──► HSK tagging ──► Sentence[]
 (paste)      (。！？… + closing     (HSK words added to      pypinyin / pinyin-pro       hsk.json lookup,       │
              quotes, newlines)      jieba's dictionary)                                compound estimate     ▼
                                                                                                  InteractiveReader
 tap word ──► DictionaryPopup ──► bundled CC-CEDICT gloss (instant) + Cambridge scraper (cached)        │
 long-press / "แปลทั้งประโยค" ──► SentenceTranslation ──► MyMemory (or LibreTranslate via backend) ◄──────┘
```

Two interchangeable engines behind `app/src/lib/api.ts`:

| Step | On device (default, offline except lookups) | FastAPI backend (`backend/`) |
|---|---|---|
| Segmentation | `jieba-wasm` (jieba-rs) | `jieba` |
| Pinyin | `pinyin-pro`, run on the **whole sentence** then sliced per token | `pypinyin` per word (phrase dictionary) |
| HSK | `public/hsk.json` | `app/data/hsk.json` (same file) |
| Cambridge | `CapacitorHttp` (native, no CORS) + `DOMParser` | `httpx` + BeautifulSoup |
| Translation | MyMemory | MyMemory or self-hosted LibreTranslate |

**Token model** – `{ text, pinyin: string[] (one per character), hsk: 1-6 | null, hskEstimated, isHan }`.
Pinyin is per character so the reader renders `<ruby>银<rt>yín</rt>行<rt>háng</rt></ruby>`, keeping
every syllable exactly above its hanzi even in long words.

**HSK tagging** – exact lookup first. jieba often keeps compounds the HSK list doesn't contain
(一个, 回家吧); those are split greedily into HSK words and get the hardest piece's level, flagged
`hskEstimated` (popup shows "≈ HSK 2"). Anything still unmatched is "outside HSK" (treated as level 7).

**HSK filter** – `shouldShowPinyin()` in `HskFilter.tsx`: `all`, `none`, or `above` (show pinyin
only when level > threshold; threshold 0 = all words). Colour-coding is independent.

## 2. Backend (`backend/app`)

* `text_processing.py` – `POST /api/process {text}` → `{sentences:[{text,tokens}]}`.
* `cambridge.py` – `GET /api/dictionary/{word}`. Tries `/dictionary/chinese-english/{w}` then
  `/dictionary/chinese-simplified-english/{w}`. Browser-like headers, rotating UA, concurrency 2,
  ≥0.5 s between upstream calls, retry with backoff honouring `Retry-After` on 403/429/5xx,
  24 h in-memory TTL cache. Parser uses both current (`ddef_d`, `dpos`, `deg`) and legacy class
  names. The response always includes the bundled HSK/CC-CEDICT gloss so the popup is never empty.
* `translate.py` – `POST /api/translate {text}`.
* CORS: `CORS_ORIGINS` env var, defaults include `https://localhost` and `capacitor://localhost`
  (the Capacitor WebView origins) and `http://localhost:3000` (dev server).

## 3. Frontend (`app/src`)

* `components/InteractiveReader.tsx` – memoised `Word` components; tap = dictionary, long-press = sentence translation.
* `components/DictionaryPopup.tsx` – bottom sheet: word, context pinyin, HSK badge, offline gloss, Cambridge entries & examples, "translate sentence".
* `components/HskFilter.tsx` – pinyin mode, threshold slider, colour toggle, font size, backend URL.
* `lib/processor.ts`, `lib/cambridge.ts`, `lib/http.ts` – on-device pipeline.

## 4. Edge cases & limitations

| Issue | Mitigation |
|---|---|
| **Polyphones** (行 xíng/háng, 长 cháng/zhǎng, 了 le/liǎo, 一/不 tone sandhi) | Pinyin is computed with context (whole sentence on device; whole word with pypinyin's phrase dictionary on the backend). Rare literary readings can still be wrong; the popup also shows the dictionary reading. |
| **Segmentation errors** (names, web-novel slang, 修仙 terms) | All HSK words are added to jieba's dictionary. Character names are often split; future work: user dictionary (`add_word`) from long-press. |
| **Cambridge has no API / may block** | Server-side or native requests only, throttle + cache + backoff. If blocked or the word is missing, the bundled CC-CEDICT gloss still shows and "เปิดหน้าเว็บ" opens the real page. HTML redesigns are handled by fallback selectors; update both parsers (`cambridge.py` / `cambridge.ts`) together. |
| **Cambridge coverage** | Its Chinese-English dictionary is smaller than CC-CEDICT; idioms and novel vocabulary are often absent ("ไม่พบคำนี้"). |
| **Terms of use** | Lookups are per user tap and cached; nothing is redistributed. Don't bulk-crawl. |
| **Translation quota** | MyMemory's free tier is ~5k chars/day per IP; set `MYMEMORY_EMAIL` or switch the backend to LibreTranslate. |
| **Traditional characters** | HSK list is simplified; traditional text segments and gets pinyin but mostly shows as "outside HSK". |
| **Large chapters** | Processing is per sentence and the `Word` component is memoised; extremely long pastes (>100k chars) should be paginated. |
| **HSK version** | Uses HSK 2.0 (levels 1-6) as requested; HSK 3.0 (1-9) can be swapped in by changing the source path in `scripts/build_hsk_data.py`. |
