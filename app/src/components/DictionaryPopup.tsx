"use client";
import { useEffect, useState } from "react";
import { lookupWord, translateSentence } from "@/lib/api";
import { HSK_STYLES, loadHsk } from "@/lib/hsk";
import type { DictionaryResult, HskEntry, Token } from "@/lib/types";

type Load<T> = { state: "loading" } | { state: "done"; data: T } | { state: "error"; message: string };

function useAsync<T>(fn: (() => Promise<T>) | null, deps: unknown[]): Load<T> | null {
  const [value, setValue] = useState<Load<T> | null>(null);
  useEffect(() => {
    if (!fn) return setValue(null);
    let alive = true;
    setValue({ state: "loading" });
    fn().then(
      (data) => alive && setValue({ state: "done", data }),
      (e) => alive && setValue({ state: "error", message: String(e?.message ?? e) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[75vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl dark:bg-zinc-900"
      >
        {children}
      </div>
    </div>
  );
}

/** Contextual English translation of one sentence. */
export function SentenceTranslation({
  sentence,
  backendUrl,
  onClose,
}: {
  sentence: string;
  backendUrl: string;
  onClose: () => void;
}) {
  const result = useAsync(() => translateSentence(sentence.trim(), backendUrl), [sentence, backendUrl]);
  return (
    <Sheet onClose={onClose}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">แปลทั้งประโยค</div>
      <p lang="zh-CN" className="font-zh mb-3 text-lg">{sentence}</p>
      {result?.state === "loading" && <p className="animate-pulse text-zinc-400">กำลังแปล…</p>}
      {result?.state === "error" && <p className="text-rose-600">แปลไม่สำเร็จ: {result.message}</p>}
      {result?.state === "done" && <p className="text-zinc-700 dark:text-zinc-200">{result.data}</p>}
      <button onClick={onClose} className="mt-4 w-full rounded-lg bg-zinc-100 py-2 dark:bg-zinc-800">
        ปิด
      </button>
    </Sheet>
  );
}

export default function DictionaryPopup({
  token,
  backendUrl,
  onClose,
  onTranslateSentence,
}: {
  token: Token;
  backendUrl: string;
  onClose: () => void;
  onTranslateSentence: () => void;
}) {
  const [hsk, setHsk] = useState<HskEntry | null>(null);
  useEffect(() => {
    loadHsk().then((t) => setHsk(t[token.text] ?? null));
  }, [token.text]);
  const cambridge = useAsync<DictionaryResult>(() => lookupWord(token.text, backendUrl), [token.text, backendUrl]);
  const level = token.hsk ? HSK_STYLES[token.hsk] : null;

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div lang="zh-CN" className="font-zh text-4xl font-semibold">{token.text}</div>
          <div className="mt-1 text-lg text-sky-700 dark:text-sky-400">{token.pinyin.join(" ")}</div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold text-white ${level?.badge ?? "bg-zinc-500"}`}>
          {level ? `${token.hskEstimated ? "≈ " : ""}${level.label}` : "นอก HSK"}
        </span>
      </div>

      {!hsk && token.hskEstimated && (
        <p className="mt-2 text-xs text-zinc-400">ไม่อยู่ในรายการ HSK — ระดับประมาณจากคำย่อยที่อยู่ข้างใน</p>
      )}
      {hsk && (
        <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
          {hsk.m.join("; ")}
        </p>
      )}

      <section className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Cambridge Dictionary</h3>
          <a
            href={`https://dictionary.cambridge.org/dictionary/chinese-english/${encodeURIComponent(token.text)}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-sky-600 underline"
          >
            เปิดหน้าเว็บ
          </a>
        </div>
        {cambridge?.state === "loading" && <p className="animate-pulse text-sm text-zinc-400">กำลังค้นหา…</p>}
        {cambridge?.state === "error" && (
          <p className="text-sm text-rose-600">เชื่อมต่อ Cambridge ไม่ได้ ({cambridge.message})</p>
        )}
        {cambridge?.state === "done" && !cambridge.data.found && (
          <p className="text-sm text-zinc-500">ไม่พบคำนี้ใน Cambridge</p>
        )}
        {cambridge?.state === "done" &&
          cambridge.data.entries.map((entry, ei) => (
            <div key={ei} className="mb-3">
              <div className="mb-1 flex flex-wrap items-baseline gap-2">
                {entry.pinyin && <span className="text-sky-700 dark:text-sky-400">{entry.pinyin}</span>}
                {entry.pos.map((p) => (
                  <span key={p} className="rounded bg-zinc-100 px-1.5 text-xs italic text-zinc-500 dark:bg-zinc-800">
                    {p}
                  </span>
                ))}
              </div>
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {entry.senses.map((s, si) => (
                  <li key={si}>
                    <span className="font-medium">{s.definition || s.translation}</span>
                    {s.definition && s.translation && <span className="text-zinc-500"> — {s.translation}</span>}
                    {s.examples.map((ex, xi) => (
                      <div key={xi} className="mt-1 border-l-2 border-zinc-200 pl-2 dark:border-zinc-700">
                        <div lang="zh-CN" className="font-zh">{ex.zh}</div>
                        {ex.en && <div className="text-zinc-500">{ex.en}</div>}
                      </div>
                    ))}
                  </li>
                ))}
              </ol>
            </div>
          ))}
      </section>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={onTranslateSentence} className="rounded-lg bg-sky-600 py-2 font-medium text-white">
          แปลทั้งประโยค
        </button>
        <button onClick={onClose} className="rounded-lg bg-zinc-100 py-2 dark:bg-zinc-800">
          ปิด
        </button>
      </div>
    </Sheet>
  );
}
