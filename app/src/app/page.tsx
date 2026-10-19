"use client";
import { useEffect, useState } from "react";
import DictionaryPopup, { SentenceTranslation } from "@/components/DictionaryPopup";
import HskFilter from "@/components/HskFilter";
import InteractiveReader, { type WordSelection } from "@/components/InteractiveReader";
import TextInput, { SAMPLE_TEXT } from "@/components/TextInput";
import { processText } from "@/lib/api";
import { DEFAULT_SETTINGS, usePersistentState } from "@/lib/settings";
import type { ReaderSettings, Sentence } from "@/lib/types";

export default function Home() {
  const [settings, setSettings] = usePersistentState<ReaderSettings>("reader-settings", DEFAULT_SETTINGS);
  const [text, setText] = usePersistentState<string>("reader-text", SAMPLE_TEXT);
  const [sentences, setSentences] = useState<Sentence[] | null>(null);
  const [view, setView] = useState<"input" | "reader">("input");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [selected, setSelected] = useState<WordSelection | null>(null);
  const [translating, setTranslating] = useState<number | null>(null);

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      setSentences(await processText(text, settings.backendUrl));
      setView("reader");
      window.scrollTo(0, 0);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  // Android hardware back button: close popups first, then return to the input screen.
  useEffect(() => {
    const onPop = () => {
      if (selected || translating !== null) {
        setSelected(null);
        setTranslating(null);
      } else setView("input");
    };
    if (view === "reader") history.pushState(null, "");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [view, selected, translating]);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <header className="sticky top-0 z-30 -mx-4 mb-4 flex items-center justify-between bg-[var(--bg)]/90 px-4 py-2 backdrop-blur">
        {view === "reader" ? (
          <button onClick={() => setView("input")} className="rounded-lg px-2 py-1 text-sky-600">
            ← แก้ไขข้อความ
          </button>
        ) : (
          <h1 className="font-zh text-xl font-bold">
            汉字阅读 <span className="text-sm font-normal text-zinc-500">Hanzi Reader</span>
          </h1>
        )}
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="rounded-lg bg-zinc-200 px-3 py-1.5 text-sm dark:bg-zinc-800"
        >
          ⚙ HSK
        </button>
      </header>

      {showSettings && (
        <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <HskFilter settings={settings} onChange={setSettings} />
        </div>
      )}

      {error && <p className="mb-3 rounded-lg bg-rose-100 p-3 text-rose-700 dark:bg-rose-950">{error}</p>}

      {view === "input" || !sentences ? (
        <TextInput value={text} onChange={setText} onSubmit={read} busy={busy} />
      ) : (
        <>
          <p className="mb-3 text-xs text-zinc-400">แตะคำเพื่อเปิดพจนานุกรม · กดค้างเพื่อแปลทั้งประโยค</p>
          <InteractiveReader
            sentences={sentences}
            settings={settings}
            selected={selected}
            highlightedSentence={translating ?? selected?.sentenceIndex ?? null}
            onSelectWord={setSelected}
            onSelectSentence={(i) => {
              setSelected(null);
              setTranslating(i);
            }}
          />
        </>
      )}

      {selected && sentences && (
        <DictionaryPopup
          key={`${selected.sentenceIndex}:${selected.tokenIndex}`}
          sentence={sentences![selected.sentenceIndex]}
          tokenIndex={selected.tokenIndex}
          backendUrl={settings.backendUrl}
          onClose={() => setSelected(null)}
          onTranslateSentence={() => {
            setTranslating(selected.sentenceIndex);
            setSelected(null);
          }}
        />
      )}
      {translating !== null && sentences && (
        <SentenceTranslation
          sentence={sentences[translating].text}
          backendUrl={settings.backendUrl}
          onClose={() => setTranslating(null)}
        />
      )}
    </main>
  );
}
