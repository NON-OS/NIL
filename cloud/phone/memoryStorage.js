// Where WalletConnect keeps a sign-up's connection keys and records, in the shape its client
// takes: a Map in this page, gone with the connection or the page. The sign-up page never writes
// the browser's storage, so nothing of a phone connection outlives it. Values are copied in and
// out as JSON, as browser storage would, so the client can't change a stored record by accident.
export default function memoryStorage() {
  const items = new Map();
  const read = (key) => (items.has(key) ? JSON.parse(items.get(key)) : undefined);
  return {
    getKeys: async () => [...items.keys()],
    getEntries: async () => [...items.keys()].map((key) => [key, read(key)]),
    getItem: async (key) => read(key),
    async setItem(key, value) {
      if (value === undefined) items.delete(key);
      else items.set(key, JSON.stringify(value));
    },
    async removeItem(key) {
      items.delete(key);
    },
  };
}
