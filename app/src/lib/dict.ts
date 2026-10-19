/** Lazily loaded bundled dictionaries (see scripts/build_data.py). */
export type Cedict = Record<string, [pinyin: string, glosses: string[], classifiers: string[]][]>;
export type Idioms = Record<string, { p: string; x: string }>;

const cache = new Map<string, Promise<unknown>>();

function load<T>(file: string, parse: (r: Response) => Promise<T>): Promise<T> {
  if (!cache.has(file)) {
    const p = fetch(`/${file}`).then(parse);
    p.catch(() => cache.delete(file)); // allow a retry after a failed load
    cache.set(file, p);
  }
  return cache.get(file) as Promise<T>;
}

export const loadCedict = () => load<Cedict>("cedict.json", (r) => r.json());
export const loadIdioms = () => load<Idioms>("idioms.json", (r) => r.json());
export const loadPhrases = () =>
  load<string[]>("phrases.txt", async (r) => (await r.text()).split("\n").filter(Boolean));
