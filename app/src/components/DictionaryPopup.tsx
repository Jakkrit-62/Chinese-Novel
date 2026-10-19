"use client";
import { useEffect, useState } from "react";
import { lookupWord, translateSentence } from "@/lib/api";
import { loadCedict, loadIdioms } from "@/lib/dict";
import { HSK_STYLES } from "@/lib/hsk";
import { findEnclosingPhrase } from "@/lib/meaning";
import type { Sentence, Token, WordInfo } from "@/lib/types";

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl dark:bg-zinc-900"
      >
        {children}
      </div>
    </div>
  );
}

const SectionTitle = ({ children, source }: { children: React.ReactNode; source?: string }) => (
  <h3 className="mb-2 mt-5 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wider text-zinc-400">
    <span>{children}</span>
    {source && <span className="font-normal normal-case tracking-normal">{source}</span>}
  </h3>
);

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
  const [state, setState] = useState<{ text?: string; error?: string }>({});
  useEffect(() => {
    let alive = true;
    setState({});
    translateSentence(sentence, backendUrl).then(
      (text) => alive && setState({ text }),
      (e) => alive && setState({ error: String(e?.message ?? e) }),
    );
    return () => {
      alive = false;
    };
  }, [sentence, backendUrl]);
  return (
    <Sheet onClose={onClose}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">แปลทั้งประโยค</div>
      <p lang="zh-CN" className="font-zh mb-3 text-lg">{sentence}</p>
      {!state.text && !state.error && <p className="animate-pulse text-zinc-400">กำลังแปล…</p>}
      {state.error && <p className="text-rose-600">แปลไม่สำเร็จ: {state.error}</p>}
      {state.text && <p className="text-zinc-700 dark:text-zinc-200">{state.text}</p>}
      <p className="mt-2 text-xs text-zinc-400">แปลด้วยเครื่อง (MyMemory) — ใช้เป็นแนวทาง ไม่ใช่คำแปลที่ตรวจแล้ว</p>
      <button onClick={onClose} className="mt-4 w-full rounded-lg bg-zinc-100 py-2 dark:bg-zinc-800">
        ปิด
      </button>
    </Sheet>
  );
}

function reasonLabel(reason: string, pinyin: string) {
  if (reason === "pinyin") return `ตรงเสียงอ่าน ${pinyin}`;
  if (reason.startsWith("context:")) return `ตรงกับคำแปลประโยค (${reason.slice(8)})`;
  return reason;
}

export default function DictionaryPopup({
  sentence,
  tokenIndex,
  backendUrl,
  onClose,
  onTranslateSentence,
}: {
  sentence: Sentence;
  tokenIndex: number;
  backendUrl: string;
  onClose: () => void;
  onTranslateSentence: () => void;
}) {
  const tapped = sentence.tokens[tokenIndex];
  // The popup can switch from the tapped token to a longer phrase/idiom that contains it.
  const [target, setTarget] = useState<Token>(tapped);
  const [phrase, setPhrase] = useState<Token | null>(null);
  const [info, setInfo] = useState<WordInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setTarget(tapped);
    Promise.all([loadCedict(), loadIdioms()]).then(([cedict, idioms]) => {
      const found = findEnclosingPhrase(sentence.tokens.map((t) => t.text), tokenIndex, cedict, idioms);
      if (!found) return setPhrase(null);
      const parts = sentence.tokens.slice(found.start, found.end + 1);
      setPhrase({ text: found.text, pinyin: parts.flatMap((t) => t.pinyin), hsk: null, isHan: true });
    });
  }, [sentence, tokenIndex, tapped]);

  useEffect(() => {
    let alive = true;
    setInfo(null);
    setError(null);
    setLoading(true);
    setShowAll(false);
    lookupWord(target.text, target.pinyin, sentence.text, backendUrl, (i) => alive && setInfo(i))
      .catch((e) => alive && setError(String(e?.message ?? e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [target, sentence.text, backendUrl]);

  const level = target.hsk ? HSK_STYLES[target.hsk] : null;
  const best = info?.senses[0];
  const others = info?.senses.slice(1) ?? [];
  const matchedCambridge = info?.cambridge.filter((m) => m.matched.length) ?? [];
  const unmatchedCambridge = info?.cambridge.filter((m) => !m.matched.length) ?? [];

  return (
    <Sheet onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div lang="zh-CN" className="font-zh text-4xl font-semibold">{target.text}</div>
          <div className="mt-1 text-lg text-sky-700 dark:text-sky-400">{target.pinyin.join(" ")}</div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold text-white ${level?.badge ?? "bg-zinc-500"}`}>
          {level ? `${target.hskEstimated ? "≈ " : ""}${level.label}` : info?.idiom ? "成语" : "นอก HSK"}
        </span>
      </div>

      {phrase && phrase.text !== target.text && (
        <button
          onClick={() => setTarget(phrase)}
          className="mt-3 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left text-sm dark:border-amber-700 dark:bg-amber-950"
        >
          คำนี้เป็นส่วนหนึ่งของวลี <b lang="zh-CN" className="font-zh">{phrase.text}</b> — แตะเพื่อดูความหมายทั้งวลี →
        </button>
      )}
      {target !== tapped && (
        <button onClick={() => setTarget(tapped)} className="mt-2 text-sm text-sky-600 underline">
          ← กลับไปที่ {tapped.text}
        </button>
      )}

      {error && <p className="mt-3 text-sm text-rose-600">ค้นหาไม่สำเร็จ: {error}</p>}

      {/* 1. Idiom: authoritative idiom sources, not word-by-word mapping */}
      {info?.idiom && (
        <>
          <SectionTitle source="CC-CEDICT · 新华成语词典">สำนวน (成语)</SectionTitle>
          <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
            {info.idiom.literal && (
              <p>
                <span className="text-zinc-500">ตามตัวอักษร:</span> {info.idiom.literal}
              </p>
            )}
            {info.idiom.figurative ? (
              <p className="font-medium">
                <span className="font-normal text-zinc-500">ความหมายจริง:</span> {info.idiom.figurative}
              </p>
            ) : (
              info.idiom.english.map((g) => <p key={g} className="font-medium">{g}</p>)
            )}
            {info.idiom.explanation && (
              <p lang="zh-CN" className="font-zh border-t border-amber-200 pt-2 text-zinc-700 dark:border-amber-800 dark:text-zinc-300">
                释义：{info.idiom.explanation}
              </p>
            )}
          </div>
          {info.cambridgeIdiom && (
            <>
              <SectionTitle source="Cambridge English">สำนวนอังกฤษที่เทียบเท่า</SectionTitle>
              <p className="text-sm">
                <a href={info.cambridgeIdiom.url} target="_blank" rel="noreferrer" className="font-medium text-sky-600 underline">
                  {info.cambridgeIdiom.phrase}
                </a>{" "}
                — {info.cambridgeIdiom.definitions[0]}
              </p>
            </>
          )}
        </>
      )}

      {/* 2. Best meaning for this occurrence */}
      {!info?.idiom && best && (
        <>
          <SectionTitle source="CC-CEDICT">ความหมายในประโยคนี้</SectionTitle>
          <div className="rounded-lg bg-sky-50 p-3 dark:bg-sky-950/40">
            <p className="font-medium">{best.gloss}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {best.pinyin}
              {best.classifiers.length > 0 && ` · ลักษณนาม ${best.classifiers.join("、")}`}
              {best.reasons.length > 0 && ` · ${best.reasons.map((r) => reasonLabel(r, best.pinyin)).join(" · ")}`}
            </p>
          </div>
        </>
      )}
      {info && !info.senses.length && !info.idiom && (
        <p className="mt-4 text-sm text-zinc-500">ไม่พบใน CC-CEDICT — ลองแตะ &quot;แปลทั้งประโยค&quot;</p>
      )}

      {/* 3. Cambridge, reached through the English headword and checked back against the Chinese */}
      {!info?.idiom && (
        <>
          <SectionTitle source="Cambridge English–Chinese">Cambridge</SectionTitle>
          {loading && !info?.cambridge.length && <p className="animate-pulse text-sm text-zinc-400">กำลังค้นใน Cambridge…</p>}
          {matchedCambridge.map((m) => (
            <div key={m.query} className="mb-3">
              <p className="mb-1 text-xs text-zinc-500">
                ค้นด้วยคำอังกฤษ{" "}
                <a href={m.url} target="_blank" rel="noreferrer" className="font-semibold text-sky-600 underline">
                  {m.query}
                </a>
                {m.gloss && m.gloss !== m.query && <> (จาก “{m.gloss}”)</>} → ความหมายที่ตรงกับ <span className="font-zh">{target.text}</span>
              </p>
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                {m.matched.slice(0, 3).map((s, i) => (
                  <li key={i}>
                    {s.guideword && <span className="mr-1 text-xs font-semibold uppercase text-zinc-400">{s.guideword}</span>}
                    {s.pos && <span className="mr-1 text-xs italic text-zinc-400">{s.pos}</span>}
                    <span className="font-medium">{s.definition}</span>
                    <span lang="zh-CN" className="font-zh ml-1 text-emerald-700 dark:text-emerald-400">
                      {s.translation}
                    </span>
                    {s.via && (
                      <div className="text-xs text-amber-700 dark:text-amber-400">
                        ความหมายใกล้เคียง: Cambridge แปลว่า <span className="font-zh">{s.via}</span> ซึ่งความหมายใน CC-CEDICT ตรงกับ <span className="font-zh">{target.text}</span>
                      </div>
                    )}
                    {s.examples.map((ex, xi) => (
                      <div key={xi} className="mt-1 border-l-2 border-zinc-200 pl-2 dark:border-zinc-700">
                        <div className="italic">{ex.en}</div>
                        {ex.zh && <div lang="zh-CN" className="font-zh text-zinc-500">{ex.zh}</div>}
                      </div>
                    ))}
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {!loading && info?.error && (
            <p className="text-sm text-rose-600">เชื่อมต่อ Cambridge ไม่ได้ ({info.error}) — ความหมายด้านบนมาจาก CC-CEDICT ในเครื่อง</p>
          )}
          {!loading && info && !info.error && !matchedCambridge.length && (
            <p className="text-sm text-zinc-500">
              {info.cambridge.length
                ? `Cambridge มีคำ ${unmatchedCambridge.map((m) => `"${m.query}"`).join(", ")} แต่ไม่มีความหมายไหนแปลกลับเป็น ${target.text} จึงไม่แสดง เพื่อไม่ให้ความหมายผิดบริบท`
                : "ไม่มีคำอังกฤษที่ใช้ค้นใน Cambridge ได้"}
            </p>
          )}
        </>
      )}

      {/* 4. Other senses */}
      {others.length > 0 && (
        <>
          <SectionTitle source="CC-CEDICT">ความหมายอื่น ({others.length})</SectionTitle>
          <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-300">
            {(showAll ? others : others.slice(0, 4)).map((s, i) => (
              <li key={i}>
                <span className="mr-1 text-xs text-sky-700 dark:text-sky-400">{s.pinyin}</span>
                {s.gloss}
              </li>
            ))}
          </ul>
          {others.length > 4 && !showAll && (
            <button onClick={() => setShowAll(true)} className="mt-1 text-xs text-sky-600 underline">
              แสดงทั้งหมด
            </button>
          )}
        </>
      )}

      {info?.context && <p className="mt-4 text-xs text-zinc-400">บริบทที่ใช้จัดอันดับ: “{info.context}”</p>}

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
