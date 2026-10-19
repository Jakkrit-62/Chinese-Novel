"use client";
import { Fragment, memo, useRef } from "react";
import type { ReaderSettings, Sentence, Token } from "@/lib/types";
import { hskColorClass, shouldShowPinyin } from "./HskFilter";

const LONG_PRESS_MS = 450;

export interface WordSelection {
  token: Token;
  sentenceIndex: number;
  tokenIndex: number;
}

/** One word: each character gets its own <rt> so pinyin sits exactly above its hanzi. */
const Word = memo(function Word({
  token,
  settings,
  active,
  onTap,
  onLongPress,
}: {
  token: Token;
  settings: ReaderSettings;
  active: boolean;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  if (!token.isHan) return <span className="whitespace-pre-wrap">{token.text}</span>;

  const chars = Array.from(token.text);
  const showPinyin = shouldShowPinyin(token, settings);
  const start = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      onLongPress();
    }, LONG_PRESS_MS);
  };
  const cancel = () => timer.current && clearTimeout(timer.current);

  return (
    <span
      role="button"
      tabIndex={0}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => !longPressed.current && onTap()}
      onKeyDown={(e) => e.key === "Enter" && onTap()}
      className={`cursor-pointer rounded px-[1px] transition-colors ${hskColorClass(token, settings)} ${
        active ? "bg-yellow-200 dark:bg-yellow-700/60" : "hover:bg-zinc-200/70 dark:hover:bg-zinc-700/60"
      }`}
    >
      <ruby>
        {chars.map((c, i) => (
          <Fragment key={i}>
            {c}
            <rt className="select-none text-[0.45em] font-normal text-zinc-500 dark:text-zinc-400">
              {showPinyin ? token.pinyin[i] : ""}
            </rt>
          </Fragment>
        ))}
      </ruby>
    </span>
  );
});

export default function InteractiveReader({
  sentences,
  settings,
  selected,
  highlightedSentence,
  onSelectWord,
  onSelectSentence,
}: {
  sentences: Sentence[];
  settings: ReaderSettings;
  selected: WordSelection | null;
  highlightedSentence: number | null;
  onSelectWord: (sel: WordSelection) => void;
  onSelectSentence: (index: number) => void;
}) {
  return (
    <article
      lang="zh-CN"
      className="font-zh leading-[2.4] tracking-wide text-zinc-900 dark:text-zinc-100"
      style={{ fontSize: settings.fontSize }}
    >
      {sentences.map((sentence, si) =>
        sentence.text === "\n" ? (
          <div key={si} className="h-[0.6em]" />
        ) : (
          <span
            key={si}
            className={highlightedSentence === si ? "rounded bg-sky-100 dark:bg-sky-900/50" : undefined}
          >
            {sentence.tokens.map((token, ti) => (
              <Word
                key={ti}
                token={token}
                settings={settings}
                active={selected?.sentenceIndex === si && selected.token === token}
                onTap={() => onSelectWord({ token, sentenceIndex: si, tokenIndex: ti })}
                onLongPress={() => onSelectSentence(si)}
              />
            ))}
          </span>
        ),
      )}
    </article>
  );
}
