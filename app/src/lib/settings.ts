"use client";
import { useEffect, useState } from "react";
import type { ReaderSettings } from "./types";

export const DEFAULT_SETTINGS: ReaderSettings = {
  pinyinMode: "above",
  pinyinThreshold: 2,
  colorByHsk: true,
  fontSize: 24,
  backendUrl: "",
};

/** useState that persists to localStorage (per-device preferences only). */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        // merge objects so settings added in a later version get their defaults
        setValue(typeof initial === "object" && initial !== null ? ({ ...initial, ...parsed } as T) : parsed);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  };
  return [value, update];
}
