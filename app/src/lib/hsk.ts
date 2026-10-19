import type { HskEntry } from "./types";

let table: Promise<Record<string, HskEntry>> | null = null;

/** Bundled HSK 1-6 list (word -> level, pinyin, CC-CEDICT gloss), loaded once. */
export function loadHsk(): Promise<Record<string, HskEntry>> {
  table ??= fetch("/hsk.json").then((r) => r.json());
  return table;
}

/** Mirrors backend estimate_level(): greedy split into HSK words, hardest piece wins. */
export function estimateLevel(word: string, table: Record<string, HskEntry>): number | null {
  const chars = Array.from(word);
  let i = 0;
  let level = 0;
  outer: while (i < chars.length) {
    for (let size = Math.min(4, chars.length - i); size > 0; size--) {
      const entry = table[chars.slice(i, i + size).join("")];
      if (entry) {
        level = Math.max(level, entry.l);
        i += size;
        continue outer;
      }
    }
    return null;
  }
  return level || null;
}

export const HSK_STYLES: Record<number, { text: string; badge: string; label: string }> = {
  1: { text: "text-emerald-700 dark:text-emerald-400", badge: "bg-emerald-600", label: "HSK 1" },
  2: { text: "text-teal-700 dark:text-teal-400", badge: "bg-teal-600", label: "HSK 2" },
  3: { text: "text-sky-700 dark:text-sky-400", badge: "bg-sky-600", label: "HSK 3" },
  4: { text: "text-violet-700 dark:text-violet-400", badge: "bg-violet-600", label: "HSK 4" },
  5: { text: "text-amber-700 dark:text-amber-400", badge: "bg-amber-600", label: "HSK 5" },
  6: { text: "text-rose-700 dark:text-rose-400", badge: "bg-rose-600", label: "HSK 6" },
};
