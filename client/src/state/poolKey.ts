import keyring from './keyring';
import type Identity from '../types/Identity';

let held: { key: Uint8Array; owner: Identity } | null = null;

// The team's pool key once this browser has opened it, in this tab's memory only. It belongs to
// the identity that opened it: once that identity is locked or replaced, the key is wiped too.
const poolKey = {
  get() {
    if (held && held.owner === keyring.identity()) return held.key;
    poolKey.forget();
    return null;
  },
  set(key: Uint8Array, owner: Identity) {
    poolKey.forget();
    held = { key, owner };
  },
  forget() {
    held?.key.fill(0);
    held = null;
  },
};

export default poolKey;
