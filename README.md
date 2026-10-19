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
| `scripts/build_hsk_data.py` | Regenerates `hsk.json` for both app and backend |
| `docs/BLUEPRINT.md` | Architecture, data flow, edge cases |

The APK works **without any server**: segmentation (jieba-wasm), pinyin (pinyin-pro) and
the Cambridge scraper (native HTTP, so no CORS) all run on the phone. If you enter a backend
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
```

## Data & licences

* HSK 2.0 word lists: [drkameleon/complete-hsk-vocabulary](https://github.com/drkameleon/complete-hsk-vocabulary) (MIT).
* Short glosses: CC-CEDICT (CC BY-SA 4.0) via the same dataset.
* Cambridge Dictionary content is fetched live per lookup and cached on device; it is not
  redistributed. Respect Cambridge's terms of use; this is intended for personal study.
