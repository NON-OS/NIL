// localStorage can throw (private mode, quota, blocked cookies), so every access is guarded.
// Only UI preferences and public key data (pinned teammate keys, doc and private task revision
// numbers, comment edit numbers) live here, never task data or anything personal.
const PREFIX = 'nonos:';

const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`${PREFIX}${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },

  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
    } catch {}
  },

  // Every key saved that starts with `start`.
  keys(start: string): string[] {
    try {
      const out: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`${PREFIX}${start}`)) out.push(key.slice(PREFIX.length));
      }
      return out;
    } catch {
      return [];
    }
  },
};

export default storage;
