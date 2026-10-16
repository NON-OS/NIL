import storage from '../lib/storage';
import store from './store';

export interface Pin {
  publicKey: string;
  signingKey: string;
  // true once this person compared fingerprints and confirmed; nothing is shared before that
  confirmed: boolean;
}

// Teammates' public keys as this browser first saw them, and whether this person confirmed
// each one. Public data only, kept per workspace and account in local storage, so a server that
// later swaps someone's key is caught here instead of believed. A copy in memory keeps
// confirmations for the session when storage is blocked.
const memory = new Map<string, Record<string, Pin>>();
const slot = () => {
  const s = store.get();
  return `key-pins:${s.workspaceKey}:${s.me?.id ?? ''}`;
};

const keyPins = {
  all: (): Record<string, Pin> => ({ ...storage.get<Record<string, Pin>>(slot(), {}), ...memory.get(slot()) }),

  put(userId: string, pin: Pin) {
    const next = { ...keyPins.all(), [userId]: pin };
    memory.set(slot(), next);
    storage.set(slot(), next);
  },
};

export default keyPins;
