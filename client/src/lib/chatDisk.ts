// What chat keeps on this device between visits, in IndexedDB: messages already signed and
// encrypted, waiting to be sent, with their encrypted files; and the search index, encrypted under
// a key derived from the unlocked identity. Nothing here is readable without the person's keys,
// and nothing in it is a key. Where IndexedDB can't be used (a private window, a test) it lives in
// memory for the tab instead. Every entry is filed under the workspace key and account it's for.
export type Shelf = 'queue' | 'files' | 'search';

const NAME = 'nil-chat';
const SHELVES: Shelf[] = ['queue', 'files', 'search'];
const memory = new Map<string, unknown>();
let opening: Promise<IDBDatabase | null> | null = null;

function db() {
  opening ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(NAME, 1);
      req.onupgradeneeded = () => SHELVES.forEach((s) => req.result.objectStoreNames.contains(s) || req.result.createObjectStore(s));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function run<T>(shelf: Shelf, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
  return db().then(
    (d) =>
      d &&
      new Promise<T | null>((resolve) => {
        try {
          const req = fn(d.transaction(shelf, mode).objectStore(shelf));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

const range = (prefix: string) => IDBKeyRange.bound(prefix, `${prefix}￿`);

const chatDisk = {
  async get<T>(shelf: Shelf, key: string): Promise<T | null> {
    if (!(await db())) return (memory.get(`${shelf}/${key}`) as T) ?? null;
    return ((await run(shelf, 'readonly', (s) => s.get(key))) as T) ?? null;
  },

  async put(shelf: Shelf, key: string, value: unknown) {
    if (!(await db())) return void memory.set(`${shelf}/${key}`, value);
    await run(shelf, 'readwrite', (s) => s.put(value, key));
  },

  async drop(shelf: Shelf, key: string) {
    if (!(await db())) return void memory.delete(`${shelf}/${key}`);
    await run(shelf, 'readwrite', (s) => s.delete(key));
  },

  // every entry whose key starts with `prefix`, as [key, value]
  async list<T>(shelf: Shelf, prefix: string): Promise<[string, T][]> {
    if (!(await db())) return [...memory].filter(([k]) => k.startsWith(`${shelf}/${prefix}`)).map(([k, v]) => [k.slice(shelf.length + 1), v as T]);
    const [keys, values] = await Promise.all([run(shelf, 'readonly', (s) => s.getAllKeys(range(prefix))), run(shelf, 'readonly', (s) => s.getAll(range(prefix)))]);
    return ((keys ?? []) as string[]).map((k, i) => [k, (values ?? [])[i] as T]);
  },

  async clear(prefix: string) {
    for (const shelf of SHELVES) for (const [key] of await chatDisk.list(shelf, prefix)) await chatDisk.drop(shelf, key);
  },
};

export default chatDisk;
