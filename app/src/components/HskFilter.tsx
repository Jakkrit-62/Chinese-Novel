"use client";
import { HSK_STYLES } from "@/lib/hsk";
import type { PinyinMode, ReaderSettings, Token } from "@/lib/types";

/** Decides, per token, whether the pinyin ruby is rendered. Words outside HSK count as level 7. */
export function shouldShowPinyin(token: Token, s: ReaderSettings): boolean {
  if (!token.isHan || s.pinyinMode === "none") return false;
  if (s.pinyinMode === "all") return true;
  return (token.hsk ?? 7) > s.pinyinThreshold;
}

export function hskColorClass(token: Token, s: ReaderSettings): string {
  if (!s.colorByHsk || !token.isHan) return "";
  return token.hsk ? HSK_STYLES[token.hsk].text : "text-zinc-900 dark:text-zinc-100 underline decoration-dotted decoration-zinc-400 underline-offset-4";
}

const MODES: { value: PinyinMode; label: string }[] = [
  { value: "all", label: "ทุกคำ" },
  { value: "above", label: "เกิน HSK" },
  { value: "none", label: "ซ่อน" },
];

export default function HskFilter({
  settings,
  onChange,
}: {
  settings: ReaderSettings;
  onChange: (s: ReaderSettings) => void;
}) {
  const set = (patch: Partial<ReaderSettings>) => onChange({ ...settings, ...patch });
  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="mb-2 font-medium text-zinc-600 dark:text-zinc-300">แสดงพินอิน (Pinyin)</div>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
          {MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => set({ pinyinMode: m.value })}
              className={`rounded-md py-1.5 ${settings.pinyinMode === m.value ? "bg-white shadow dark:bg-zinc-600" : "text-zinc-500"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {settings.pinyinMode === "above" && (
        <div>
          <div className="mb-2 flex justify-between text-zinc-600 dark:text-zinc-300">
            <span>แสดงพินอินเฉพาะคำที่ยากกว่า</span>
            <span className="font-semibold">HSK {settings.pinyinThreshold}</span>
          </div>
          <input
            type="range"
            min={0}
            max={6}
            value={settings.pinyinThreshold}
            onChange={(e) => set({ pinyinThreshold: Number(e.target.value) })}
            className="w-full accent-sky-600"
          />
          <div className="flex justify-between text-xs text-zinc-400">
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </div>
      )}

      <label className="flex items-center justify-between">
        <span className="text-zinc-600 dark:text-zinc-300">ระบายสีตามระดับ HSK</span>
        <input
          type="checkbox"
          checked={settings.colorByHsk}
          onChange={(e) => set({ colorByHsk: e.target.checked })}
          className="h-5 w-5 accent-sky-600"
        />
      </label>
      {settings.colorByHsk && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(HSK_STYLES).map(([lvl, st]) => (
            <span key={lvl} className={`font-semibold ${st.text}`}>
              {st.label}
            </span>
          ))}
          <span className="text-zinc-500 underline decoration-dotted underline-offset-4">นอก HSK</span>
        </div>
      )}

      <div>
        <div className="mb-2 flex justify-between text-zinc-600 dark:text-zinc-300">
          <span>ขนาดตัวอักษร</span>
          <span>{settings.fontSize}px</span>
        </div>
        <input
          type="range"
          min={16}
          max={40}
          value={settings.fontSize}
          onChange={(e) => set({ fontSize: Number(e.target.value) })}
          className="w-full accent-sky-600"
        />
      </div>

      <div>
        <div className="mb-1 text-zinc-600 dark:text-zinc-300">FastAPI backend (ไม่บังคับ)</div>
        <input
          type="url"
          placeholder="ว่างไว้ = ประมวลผลในเครื่อง"
          value={settings.backendUrl}
          onChange={(e) => set({ backendUrl: e.target.value.trim().replace(/\/+$/, "") })}
          className="w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 dark:border-zinc-600"
        />
      </div>
    </div>
  );
}
