const DB = 'nil-sealed';
const STORE = 'items';

let opened: Promise<IDBDatabase | null> | null = null;
// where records go when the browser has no IndexedDB (or blocks it); they last as long as the tab
const memory = new Map<string, Uint8Array>();

function open() {
  opened ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opened;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (db) =>
      db &&
      new Promise<T>((resolve, reject) => {
        const req = work(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// A small key-value shelf in IndexedDB for bytes that are already encrypted. Nothing readable
// goes in here; see sealedLocal.
const idbStore = {
  async get(key: string): Promise<Uint8Array | null> {
    const db = await open();
    if (!db) return memory.get(key) ?? null;
    const value = await run('readonly', (s) => s.get(key));
    return value instanceof Uint8Array ? value : null;
  },

  async put(key: string, value: Uint8Array) {
    if (!(await open())) return void memory.set(key, value);
    await run('readwrite', (s) => s.put(value, key));
  },

  async remove(key: string) {
    if (!(await open())) return void memory.delete(key);
    await run('readwrite', (s) => s.delete(key));
  },

  // every key that starts with `start`
  async keys(start: string): Promise<string[]> {
    if (!(await open())) return [...memory.keys()].filter((k) => k.startsWith(start));
    const range = IDBKeyRange.bound(start, `${start}￿`);
    return ((await run('readonly', (s) => s.getAllKeys(range))) ?? []).map(String);
  },
};

export default idbStore;
