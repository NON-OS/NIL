import type { SigningFlow } from '../lib/signingFlows';

// Which run of wallet signatures is under way and how far it has got, for the guide that says
// what each signature is for. Step 0 is before the first one is asked for.
interface Signing {
  flow: SigningFlow;
  step: number;
}

let current: Signing | null = null;
const listeners = new Set<() => void>();
const set = (next: Signing | null) => {
  current = next;
  listeners.forEach((listener) => listener());
};

const signing = {
  get: () => current,

  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  // Runs `work` as one run of signatures. One already under way carries on instead, since
  // giving a new backup wallet your keys is part of linking it.
  async run<T>(flow: SigningFlow, work: () => Promise<T>): Promise<T> {
    if (current) return work();
    set({ flow, step: 0 });
    try {
      return await work();
    } finally {
      set(null);
    }
  },

  // Called just before each wallet signature. Outside a run it does nothing.
  next() {
    if (current) set({ ...current, step: current.step + 1 });
  },
};

export default signing;
