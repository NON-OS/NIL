// sessionStorage, so the guard is per tab and gone when the tab closes
const KEY = 'nonos:reloaded-at';
// a fresh page that fails the same way within this long isn't fixed by reloading again
const LOOP_MS = 30_000;
let started = false;

// Reloads to pick up a new deploy when a tab finds its own files gone.
const reloader = {
  // Reloads unless that was just tried, and says whether it did. Without session storage a loop
  // can't be ruled out, so it doesn't try at all.
  once(): boolean {
    if (started) return true;
    try {
      const last = Number(sessionStorage.getItem(KEY));
      if (last && Date.now() - last < LOOP_MS) return false;
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      return false;
    }
    started = true;
    location.reload();
    return true;
  },

  started: () => started,
};

export default reloader;
