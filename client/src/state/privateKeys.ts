import type PrivateKeys from '../types/PrivateKeys';

// Your stealth and anonymous-voting keys, held only in this tab's memory: never stored, never
// sent anywhere, wiped on sign-out. Signing the key message again brings them back.
let keys: PrivateKeys | null = null;

const privateKeys = {
  get: () => keys,
  set(next: PrivateKeys) {
    keys = next;
  },
  lock() {
    if (keys) for (const k of Object.values(keys)) k.fill(0);
    keys = null;
  },
};

export default privateKeys;
