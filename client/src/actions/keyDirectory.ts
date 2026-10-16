import http from '../api/http';
import store from '../state/store';
import keyring from '../state/keyring';
import keyPins, { type Pin } from '../state/keyPins';
import verifyKeyStatement from '../lib/crypto/verifyKeyStatement';
import memberFingerprint from '../lib/crypto/memberFingerprint';
import b64u from '../lib/crypto/b64u';
import type KeyEntry from '../types/KeyEntry';
import type MemberKey from '../types/MemberKey';

let cache: { rev: number; keys: Promise<Map<string, MemberKey>> } | null = null;

const same = (a: { publicKey: string; signingKey: string }, b: { publicKey: string; signingKey: string }) => a.publicKey === b.publicKey && a.signingKey === b.signingKey;

// The browser's own identity is trusted as soon as it's unlocked; nobody needs to confirm it.
function ownPin(entry: KeyEntry): Pin | null {
  const id = keyring.identity();
  if (!id || entry.userId !== store.get().me?.id) return null;
  const mine = { publicKey: b64u.encode(id.publicKey), signingKey: b64u.encode(id.signingKey) };
  return same(mine, entry) ? { ...mine, confirmed: true } : null;
}

// Every published key whose wallet signature checks out here, measured against the pins. A key
// seen for the first time is pinned as it is (unconfirmed), so a later swap shows up as a change.
async function fetchKeys() {
  const { origin, workspaceKey } = store.get();
  const entries = await http.get<KeyEntry[]>('/encryption-keys');
  const pins = keyPins.all();
  const out = new Map<string, MemberKey>();
  for (const entry of entries) {
    if (!verifyKeyStatement(entry, { origin, workspaceKey })) continue;
    let pin = pins[entry.userId];
    const own = ownPin(entry);
    if (own && !(pin?.confirmed && same(pin, own))) keyPins.put(entry.userId, (pin = own));
    if (!pin) keyPins.put(entry.userId, (pin = { publicKey: entry.publicKey, signingKey: entry.signingKey, confirmed: false }));
    const matches = same(pin, entry);
    out.set(entry.userId, {
      ...entry,
      fingerprint: memberFingerprint(entry.publicKey, entry.signingKey),
      state: matches ? (pin.confirmed ? 'confirmed' : 'new') : 'changed',
      previousFingerprint: matches ? null : memberFingerprint(pin.publicKey, pin.signingKey),
      trustedSigningKey: pin.signingKey,
    });
  }
  return out;
}

// The key directory as this browser sees it. The server lists keys; the browser decides which to
// believe: only wallet-signed ones, and for sharing only ones this person has confirmed.
const keyDirectory = {
  load({ fresh = false } = {}) {
    const rev = store.get().keysRev;
    if (!fresh && cache?.rev === rev) return cache.keys;
    const keys = fetchKeys();
    cache = { rev, keys };
    keys.catch(() => (cache = null));
    return keys;
  },

  // Public keys safe to seal to: active members whose key this person confirmed. Everyone else
  // is left out, and gets the key handed over once they're confirmed.
  async sharable(userIds: (string | null)[]) {
    const keys = await keyDirectory.load({ fresh: true });
    const out = new Map<string, Uint8Array>();
    for (const userId of new Set(userIds)) {
      const key = userId ? keys.get(userId) : undefined;
      if (key?.active && key.state === 'confirmed') out.set(key.userId, b64u.decode(key.publicKey));
    }
    return out;
  },

  // Teammates with new or changed keys, for the prompt that asks this person to confirm them.
  async pending(userIds?: string[]) {
    const me = store.get().me?.id;
    return [...(await keyDirectory.load()).values()].filter((k) => k.active && k.userId !== me && k.state !== 'confirmed' && (!userIds || userIds.includes(k.userId)));
  },

  // Pins the published keys of these people as confirmed.
  async confirm(userIds: string[]) {
    const keys = await keyDirectory.load();
    for (const userId of userIds) {
      const key = keys.get(userId);
      if (key) keyPins.put(userId, { publicKey: key.publicKey, signingKey: key.signingKey, confirmed: true });
    }
    store.set((s) => ({ keysRev: s.keysRev + 1 }));
  },

  // The key a member's signatures are checked against: the one pinned here, even when the server
  // now lists another, so content signed by a swapped-in key doesn't pass until it's confirmed.
  async signingKeyOf(userId: string) {
    const listed = (await keyDirectory.load()).get(userId);
    const pinned = keyPins.all()[userId];
    const key = listed?.trustedSigningKey ?? pinned?.signingKey;
    return key ? b64u.decode(key) : null;
  },
};

export default keyDirectory;
