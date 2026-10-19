"""FastAPI service: text processing, Cambridge lookups and sentence translation.

Run: uvicorn app.main:app --reload --port 8000
"""
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import cambridge
from .hsk import hsk_entry
from .text_processing import _init_jieba, process_text
from .translate import translate


@asynccontextmanager
async def lifespan(_: FastAPI):
    _init_jieba()  # load the dictionary once at startup, not on the first request
    yield
    await cambridge.close_client()


app = FastAPI(title="Chinese Reader API", lifespan=lifespan)

# The Capacitor WebView serves the app from https://localhost (Android) / capacitor://localhost (iOS).
origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,https://localhost,capacitor://localhost").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["*"])


class ProcessRequest(BaseModel):
    text: str = Field(max_length=200_000)


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/api/process")
def process(req: ProcessRequest):
    return {"sentences": process_text(req.text)}


@app.get("/api/dictionary/{word}")
async def dictionary(word: str):
    try:
        result = await cambridge.lookup(word)
    except httpx.HTTPError as exc:
        result = {"word": word, "found": False, "entries": [], "error": str(exc)}
    # Always include the bundled CC-CEDICT/HSK gloss so the popup is never empty.
    result["hsk"] = hsk_entry(word)
    return result


@app.post("/api/translate")
async def translate_sentence(req: TranslateRequest):
    try:
        return await translate(req.text)
    except (httpx.HTTPError, KeyError) as exc:
        raise HTTPException(502, f"Translation provider failed: {exc}") from exc
