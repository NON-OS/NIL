import store from '../state/store';

// Pauses between tries while the server can't be reached, growing up to the last one.
const PAUSES_MS = [2000, 4000, 8000, 15_000, 30_000];

let tries = 0;
let timer: number | undefined;
let again: (() => void) | null = null;

function tryNow() {
  clearTimeout(timer);
  window.removeEventListener('online', tryNow);
  const run = again;
  again = null;
  store.set({ offlineRetryAt: null });
  run?.();
}

// The app couldn't reach its server while starting. Instead of the sign-in screen it shows that
// it's offline, stays on the address it was opened at, and starts again by itself: after a pause
// that grows each time, at once when the browser says it's back online, or when asked.
const offline = {
  wait(retry: () => void) {
    again = retry;
    const pause = PAUSES_MS[Math.min(tries++, PAUSES_MS.length - 1)];
    store.set({ phase: 'offline', offlineRetryAt: Date.now() + pause });
    timer = window.setTimeout(tryNow, pause);
    window.addEventListener('online', tryNow);
  },

  tryNow,

  // the server answered, so a later outage starts again from the shortest pause
  answered() {
    tries = 0;
  },
};

export default offline;
