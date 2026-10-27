import store from './store';

// Thumbnails this tab decrypted, as blob: URLs by thumbnail blob id, so going back to a folder
// shows them at once. Memory only: revoked when the keys lock, and the oldest ones once there
// are more than LIMIT.
const LIMIT = 400;
const urls = new Map<string, string>();
let unlocked = false;

function clear() {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}

store.subscribe(() => {
  const now = store.get().docsUnlocked;
  if (unlocked && !now) clear();
  unlocked = now;
});

const thumbCache = {
  get: (id: string) => urls.get(id),
  put(id: string, url: string) {
    urls.set(id, url);
    for (const [old, oldUrl] of urls) {
      if (urls.size <= LIMIT) break;
      URL.revokeObjectURL(oldUrl);
      urls.delete(old);
    }
  },
};

export default thumbCache;
