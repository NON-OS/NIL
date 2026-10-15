// Immutable helpers for the id-keyed maps in the store.
const records = {
  put<T extends { id: string }>(map: Record<string, T>, item: T): Record<string, T> {
    return { ...map, [item.id]: item };
  },

  drop<T>(map: Record<string, T>, id: string): Record<string, T> {
    if (!(id in map)) return map;
    const next = { ...map };
    delete next[id];
    return next;
  },

  fromList<T extends { id: string }>(list: T[]): Record<string, T> {
    return Object.fromEntries(list.map((item) => [item.id, item]));
  },
};

export default records;
