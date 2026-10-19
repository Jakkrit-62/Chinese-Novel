# Hanzi Reader 汉字阅读

A Readibu-style Android app for reading Chinese: pinyin above each word, tap-to-look-up
(Cambridge Dictionary), HSK 1-6 colour coding / pinyin filtering, and sentence translation.

## Get the APK

Every push builds an APK on GitHub Actions and publishes it to the
[`latest-apk` release](../../releases/tag/latest-apk) as **HanziReader.apk**.
On your phone: download it, allow "install unknown apps" for your browser, install.
(The workflow run's *Artifacts* section has the same file.)

## Layout

| Path | What |
|---|---|
| `app/` | Next.js 16 + Tailwind 4 static app, packaged by Capacitor 8 into `app/android` |
| `backend/` | Optional FastAPI service (jieba + pypinyin + BeautifulSoup Cambridge scraper) |
| `data/` | Bundled dictionaries (HSK, CC-CEDICT, Xinhua idioms) shared by app and backend |
| `scripts/build_data.py` | Regenerates `data/` from the upstream sources |
| `docs/BLUEPRINT.md` | Architecture, data flow, edge cases |

The APK works **without any server**: segmentation (jieba-wasm), pinyin (pinyin-pro), the
CC-CEDICT/idiom dictionaries and the Cambridge lookups (native HTTP, so no CORS) all run on the
phone. Cambridge is indexed by English headwords, so a Chinese word is bridged through CC-CEDICT
and only Cambridge senses that translate back to the original word are shown - see
`docs/BLUEPRINT.md`. If you enter a backend
URL in the ⚙ panel, the app uses the FastAPI service instead.

## Develop

```bash
# web app
cd app && npm install && npm run dev          # http://localhost:3000

# build the APK locally (needs Android SDK + JDK 21)
cd app && npm run android:apk                 # -> app/android/app/build/outputs/apk/debug/

# backend
cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
.venv/bin/python -m pytest
.venv/bin/python -m app.smoke                 # live Cambridge check (needs internet)

# tests for the on-device pipeline
cd app && npm test
```

## Data & licences

* HSK 2.0 word lists: [drkameleon/complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) (MIT).
* [CC-CEDICT](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) (CC BY-SA 4.0), via the `cedict-json` npm package.
* Idiom explanations: [pwxcoo/chinese-xinhua](https://github.com/pwxcoo/chinese-xinhua) (MIT).
* Cambridge Dictionary content is fetched live per lookup and cached on device; it is not
  redistributed. Respect Cambridge's terms of use; this is intended for personal study.
