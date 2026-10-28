import * as Y from 'yjs';

const MAX_THREADS = 5000;
const MAX_MESSAGES = 1000;
const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const time = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const THREAD: Record<string, (v: unknown) => boolean> = {
  quote: (v) => str(v, 300),
  by: (v) => str(v, 64),
  at: time,
  resolved: (v) => typeof v === 'boolean',
  messages: (v) => v instanceof Y.Array && v.length <= MAX_MESSAGES && v.toArray().every(message),
};
const MESSAGE: Record<string, (v: unknown) => boolean> = { id: (v) => str(v, 32), by: (v) => str(v, 64), at: time, text: (v) => str(v, 4000), sig: (v) => str(v, 200) };

function message(m: unknown) {
  if (typeof m !== 'object' || m === null || Array.isArray(m)) return false;
  return Object.entries(m).every(([k, v]) => Object.hasOwn(MESSAGE, k) && MESSAGE[k](v));
}

// The comment threads kept inside a doc, in exactly the shape Nil writes them.
export default function commentsCheck(comments: Y.Map<unknown>) {
  if (comments.size > MAX_THREADS) return false;
  for (const thread of comments.values()) {
    if (!(thread instanceof Y.Map)) return false;
    for (const [k, v] of thread.entries()) if (!Object.hasOwn(THREAD, k) || !THREAD[k](v)) return false;
  }
  return true;
}
