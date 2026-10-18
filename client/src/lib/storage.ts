// localStorage can throw (private mode, quota, blocked cookies), so every access is guarded.
// Only UI preferences and public key data (pinned teammate keys, doc and private task revision
// numbers, the vote sums this browser helped decrypt) live here, never task data or anything
// personal.
const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`nonos:${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },

  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`nonos:${key}`, JSON.stringify(value));
    } catch {}
  },
};

export default storage;
