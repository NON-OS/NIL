import log from './log.js';

const WINDOW_MS = 10 * 60_000;
const recent = new Map();

// For failures that repeat every minute while something stays broken: a node that is down, a
// locked database, a client sending junk. The first one is logged, the rest of the window is
// only counted, and the count goes out with the next one that gets through. Keys are fixed
// names chosen by the caller, so this map stays small.
export default function logLimited(key, level, scope, message, err) {
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last.at < WINDOW_MS) {
    last.held++;
    return;
  }
  recent.set(key, { at: now, held: 0 });
  log[level](scope, last?.held ? `${message} (${last.held} more held back since the last report)` : message, err);
}
