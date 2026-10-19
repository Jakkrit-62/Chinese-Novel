"use client";

// Original sample passage written for this app (not taken from any published novel).
export const SAMPLE_TEXT = `第一章 雨夜

那天晚上下着大雨，林小雨一个人走在回家的路上。她刚从银行下班，手里拿着一把旧雨伞。

“你还好吗？”一个陌生的声音从后面传来。

她回头一看，是一位穿着白衣服的年轻人。他笑着说：“雨太大了，我送你回家吧。”

小雨犹豫了一下，心想：这个人看起来不像坏人，可是我们根本不认识啊。

她本来想多问几句，又觉得再问就是画蛇添足了，于是点了点头。`;

export default function TextInput({
  value,
  onChange,
  onSubmit,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  const paste = async () => {
    try {
      onChange(await navigator.clipboard.readText());
    } catch {
      /* clipboard permission denied - user can long-press paste instead */
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <textarea
        lang="zh-CN"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="วางข้อความภาษาจีนที่นี่… (粘贴中文文本)"
        className="font-zh min-h-[50vh] w-full resize-y rounded-xl border border-zinc-300 bg-white p-4 text-lg leading-relaxed outline-none focus:border-sky-500 dark:border-zinc-700 dark:bg-zinc-900"
      />
      <div className="grid grid-cols-3 gap-2 text-sm">
        <button onClick={paste} className="rounded-lg bg-zinc-200 py-2.5 dark:bg-zinc-800">
          วาง
        </button>
        <button onClick={() => onChange(SAMPLE_TEXT)} className="rounded-lg bg-zinc-200 py-2.5 dark:bg-zinc-800">
          ตัวอย่าง
        </button>
        <button onClick={() => onChange("")} className="rounded-lg bg-zinc-200 py-2.5 dark:bg-zinc-800">
          ล้าง
        </button>
      </div>
      <button
        onClick={onSubmit}
        disabled={busy || !value.trim()}
        className="rounded-xl bg-sky-600 py-3 text-lg font-semibold text-white disabled:opacity-50"
      >
        {busy ? "กำลังประมวลผล…" : "เริ่มอ่าน 开始阅读"}
      </button>
    </div>
  );
}
