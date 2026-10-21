// The prover is a separate program, in the prover folder and under the GNU GPL, that the app runs
// as a Web Worker and talks to only through messages: plain data in, plain data out. This sends
// one request and waits for its reply.
const SCRIPT = '/prover/prover-worker.js';
// a proof takes seconds on a laptop and longer on an old phone; past this the prover is stuck
const TIMEOUT_MS = 5 * 60_000;

interface Reply {
  id: number;
  ok: boolean;
  error?: string;
}

interface Waiting {
  settle: (reply: Reply) => void;
  fail: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, Waiting>();

// Every request still out fails at once, and the next one starts a fresh prover.
function stop(error: Error) {
  for (const entry of waiting.values()) {
    clearTimeout(entry.timer);
    entry.fail(error);
  }
  waiting.clear();
  worker?.terminate();
  worker = null;
}

// The prover's file is named the same in every release, so the build id goes into its address:
// a tab never runs one release's app against another release's prover.
function start() {
  const build = typeof document === 'undefined' ? null : document.querySelector<HTMLMetaElement>('meta[name="nil-build"]')?.content;
  const next = new Worker(build ? `${SCRIPT}?build=${encodeURIComponent(build)}` : SCRIPT);
  next.onmessage = (event: MessageEvent<Reply>) => {
    const entry = waiting.get(event.data?.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    waiting.delete(event.data.id);
    entry.settle(event.data);
  };
  next.onerror = (event) => {
    event.preventDefault?.();
    stop(new Error('The prover stopped. Reload the page and try again.'));
  };
  return next;
}

export default function proverCall<T>(request: { op: string } & Record<string, unknown>): Promise<T> {
  worker ??= start();
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => stop(new Error('The proof took too long. Reload the page and try again.')), TIMEOUT_MS);
    const settle = (reply: Reply) => (reply.ok ? resolve(reply as T) : reject(new Error(reply.error || 'The prover couldn’t make that proof.')));
    waiting.set(id, { settle, fail: reject, timer });
    worker!.postMessage({ ...request, id });
  });
}
