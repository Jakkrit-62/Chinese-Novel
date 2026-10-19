// Copies generated assets into public/ (which only holds git-ignored files, so may not exist yet):
// the jieba WASM binary and the shared dictionaries from ../data.
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync("node_modules/jieba-wasm/pkg/web/jieba_rs_wasm_bg.wasm", "public/jieba_rs_wasm_bg.wasm");
for (const file of readdirSync("../data")) copyFileSync(`../data/${file}`, `public/${file}`);
