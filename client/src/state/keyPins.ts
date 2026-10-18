import storage from '../lib/storage';
import keyScope from './keyScope';

// A key this person confirmed for a teammate before their current one, kept so what the teammate
// signed with it still checks out. `until` is when its successor was published.
export interface EarlierKey {
  publicKey: string;
  signingKey: string;
  until: number;
}

export interface Pin {
  publicKey: string;
  signingKey: string;
  // true once this person compared fingerprints and confirmed; nothing is shared before that
  confirmed: boolean;
  // when the key was published, from its signed statement; missing on pins made before it was kept
  createdAt?: number;
  // keys confirmed earlier, newest first
  earlier?: EarlierKey[];
}

// Teammates' public keys as this browser first saw them, and whether this person confirmed
// each one. Public data only, kept per workspace and account in local storage, so a server that
// later swaps someone's key is caught here instead of believed. A copy in memory keeps
// confirmations for the session when storage is blocked.
const memory = new Map<string, Record<string, Pin>>();
const slot = () => keyScope.slot('key-pins');
const pinsIn = (name: string | null): Record<string, Pin> => (name ? { ...storage.get<Record<string, Pin>>(name, {}), ...memory.get(name) } : {});

const keyPins = {
  all: () => pinsIn(slot()),

  put(userId: string, pin: Pin) {
    const here = slot();
    if (!here) return;
    const next = { ...pinsIn(here), [userId]: pin };
    memory.set(here, next);
    storage.set(here, next);
  },

  // True when this browser holds pins for another workspace key or account but none for this
  // one. Expected the first time someone uses this browser; otherwise the server may be naming a
  // workspace or account this person never used here, so that every pin starts over.
  startedOver() {
    const here = slot();
    if (!here) return false;
    const elsewhere = [...storage.keys('key-pins:'), ...memory.keys()].filter((name) => name !== here);
    return !Object.keys(pinsIn(here)).length && elsewhere.some((name) => Object.keys(pinsIn(name)).length > 0);
  },
};

export default keyPins;
