"""Sentence-level zh -> en translation.

Default provider is MyMemory (free, keyless, ~5k chars/day per IP; pass MYMEMORY_EMAIL to raise it).
Set TRANSLATE_PROVIDER=libretranslate + LIBRETRANSLATE_URL to use a self-hosted instance instead.
"""
import os

import httpx

PROVIDER = os.getenv("TRANSLATE_PROVIDER", "mymemory")


async def translate(text: str, source: str = "zh-CN", target: str = "en") -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        if PROVIDER == "libretranslate":
            resp = await client.post(
                os.environ["LIBRETRANSLATE_URL"].rstrip("/") + "/translate",
                json={"q": text, "source": "zh", "target": target, "format": "text",
                      "api_key": os.getenv("LIBRETRANSLATE_KEY", "")},
            )
            resp.raise_for_status()
            return {"text": text, "translation": resp.json()["translatedText"], "provider": PROVIDER}

        params = {"q": text, "langpair": f"{source}|{target}"}
        if os.getenv("MYMEMORY_EMAIL"):
            params["de"] = os.environ["MYMEMORY_EMAIL"]
        resp = await client.get("https://api.mymemory.translated.net/get", params=params)
        resp.raise_for_status()
        data = resp.json()
        return {"text": text, "translation": data["responseData"]["translatedText"], "provider": "mymemory"}
