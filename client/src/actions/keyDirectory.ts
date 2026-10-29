import http from '../api/http';
import store from '../state/store';
import keyring from '../state/keyring';
import keyPins, { type Pin } from '../state/keyPins';
import verifyKeyStatement from '../lib/crypto/verifyKeyStatement';
import memberFingerprint from '../lib/crypto/memberFingerprint';
import b64u from '../lib/crypto/b64u';
import type KeyEntry from '../types/KeyEntry';
import type MemberKey from '../types/MemberKey';

type Keys = Map<string, MemberKey>;
type PublicKeys = { publicKey: string; signingKey: string };

let cache: { rev: number; keys: Promise<Keys> } | null = null;
// how the last listing looked, so a fetch that brings a change redraws whatever shows keys
let lastSeen: string | null = null;

const same = (a: PublicKeys, b: PublicKeys) => a.publicKey === b.publicKey && a.signingKey === b.signingKey;
const digest = (keys: Keys) => JSON.stringify([...keys.values()].map((k) => [k.userId, k.publicKey, k.signingKey, k.createdAt, k.active, k.state]));

// A key pinned as confirmed. The pin it replaces is kept when that one was confirmed too, so
// what the member signed with it before the change still checks out.
function confirmedPin(previous: Pin | undefined, key: PublicKeys & { createdAt: number }): Pin {
  const earlier = previous?.earlier ?? [];
  const replaced = previous?.confirmed && !same(previous, key) ? [{ publicKey: previous.publicKey, signingKey: previous.signingKey, until: key.createdAt }, ...earlier] : earlier;
  return { publicKey: key.publicKey, signingKey: key.signingKey, confirmed: true, createdAt: key.createdAt, earlier: replaced };
}

// The browser's own identity is trusted as soon as it's unlocked; nobody needs to confirm it.
function ownPin(entry: KeyEntry, pin: Pin | undefined): Pin | null {
  const id = keyring.identity();
  if (!id || entry.userId !== store.get().me?.id) return null;
  const mine = { publicKey: b64u.encode(id.publicKey), signingKey: b64u.encode(id.signingKey) };
  return same(mine, entry) ? confirmedPin(pin, entry) : null;
}

// Every published key whose wallet signature checks out here, measured against the pins. A key
// seen for the first time is pinned as it is (unconfirmed), so a later swap shows up as a change.
async function fetchKeys() {
  const { origin, workspaceKey } = store.get();
  const entries = await http.get<KeyEntry[]>('/encryption-keys');
  const pins = keyPins.all();
  const out: Keys = new Map();
  for (const entry of entries) {
    if (!verifyKeyStatement(entry, { origin, workspaceKey })) continue;
    let pin = pins[entry.userId];
    const own = ownPin(entry, pin);
    if (own && !(pin?.confirmed && same(pin, own))) keyPins.put(entry.userId, (pin = own));
    if (!pin) keyPins.put(entry.userId, (pin = { publicKey: entry.publicKey, signingKey: entry.signingKey, confirmed: false, createdAt: entry.createdAt }));
    const matches = same(pin, entry);
    out.set(entry.userId, {
      ...entry,
      fingerprint: memberFingerprint(entry.publicKey, entry.signingKey),
      state: matches ? (pin.confirmed ? 'confirmed' : 'new') : 'changed',
      previousFingerprint: matches ? null : memberFingerprint(pin.publicKey, pin.signingKey),
    });
  }
  return out;
}

// Keys members replaced, whose wallet signature checks out here, each good for what was signed
// before the key after it was published (that key's own signed time): userId -> keys, oldest first.
type Earlier = Map<string, { publicKey: string; signingKey: string; until: number }[]>;
let earlierCache: { rev: number; keys: Promise<Earlier> } | null = null;

async function fetchEarlier(current: Keys): Promise<Earlier> {
  const { origin, workspaceKey } = store.get();
  const entries = (await http.get<KeyEntry[]>('/encryption-keys/earlier').catch(() => [] as KeyEntry[])).filter((e) => verifyKeyStatement(e, { origin, workspaceKey }));
  const out: Earlier = new Map();
  for (const userId of new Set(entries.map((e) => e.userId))) {
    const mine = entries.filter((e) => e.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
    const list = [];
    for (let i = 0; i < mine.length; i++) {
      const until = mine[i + 1]?.createdAt ?? current.get(userId)?.createdAt;
      // without a signed successor there's nothing that says when it stopped counting
      if (until !== undefined && until > mine[i].createdAt) list.push({ publicKey: mine[i].publicKey, signingKey: mine[i].signingKey, until });
    }
    out.set(userId, list);
  }
  return out;
}

// The key directory as this browser sees it. The server lists keys; the browser decides which to
// believe: only wallet-signed ones, and for sharing only ones this person has confirmed.
const keyDirectory = {
  load({ fresh = false } = {}) {
    const rev = store.get().keysRev;
    if (!fresh && cache?.rev === rev) return cache.keys;
    const keys = fetchKeys().then((list) => {
      const now = digest(list);
      const changed = lastSeen !== null && now !== lastSeen;
      lastSeen = now;
      if (changed) {
        const next = store.get().keysRev + 1;
        if (cache?.keys === keys) cache = { rev: next, keys };
        store.set({ keysRev: next });
      }
      return list;
    });
    cache = { rev, keys };
    keys.catch(() => (cache = null));
    return keys;
  },

  // Keys members replaced, checked here; fetched again whenever the directory is.
  earlier() {
    const rev = store.get().keysRev;
    if (earlierCache?.rev === rev) return earlierCache.keys;
    const keys = keyDirectory.load().then(fetchEarlier);
    earlierCache = { rev, keys };
    keys.catch(() => (earlierCache = null));
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

  // Every key this person hasn't confirmed, for the notice and the prompt that asks them to check
  // it: deactivated members and people the workspace doesn't list included, since their
  // signatures would otherwise count without anyone having seen the key.
  async pending(userIds?: string[]) {
    const me = store.get().me?.id;
    return [...(await keyDirectory.load()).values()].filter((k) => k.userId !== me && k.state !== 'confirmed' && (!userIds || userIds.includes(k.userId)));
  },

  // Pins as confirmed exactly the keys this person compared, and only if the server still lists
  // them. A key swapped in while the fingerprints were being read out is caught here.
  async confirm(shown: MemberKey[]) {
    const keys = await keyDirectory.load({ fresh: true });
    const listed = shown.map((k) => (k && typeof k === 'object' ? keys.get(k.userId) : undefined));
    if (shown.some((k, i) => !listed[i] || !same(listed[i]!, k))) {
      store.set((s) => ({ keysRev: s.keysRev + 1 }));
      throw new Error('A key changed while you were comparing, so nothing was confirmed. Compare the fingerprint shown now.');
    }
    const pins = keyPins.all();
    for (const key of listed) keyPins.put(key!.userId, confirmedPin(pins[key!.userId], key!));
    store.set((s) => ({ keysRev: s.keysRev + 1 }));
  },

  // The keys a member's signature is checked against, for something signed at `at` (null when it
  // carries no time). The pinned key counts once this person has confirmed it, or while it's
  // listed for an active member, where the notice shows it. A key confirmed earlier counts for
  // what was signed before its successor was published. `old` is that key's fingerprint.
  // With `former`, a member no longer active counts too, for what carries a time: chat, where every
  // list and message is also held to who was in the conversation then.
  async signers(userId: string, at: number | null, { former = false } = {}) {
    const listed = (await keyDirectory.load()).get(userId);
    const pin = keyPins.all()[userId];
    const user = store.get().users[userId];
    const id = keyring.identity();
    const out: { key: Uint8Array; old: string | null }[] = [];
    if (id && userId === store.get().me?.id) out.push({ key: id.signingKey, old: null });
    const counts = Boolean(listed && user && (listed.active && !user.deactivated ? true : former && at !== null));
    if (!(id && userId === store.get().me?.id) && pin && (pin.confirmed || counts)) out.push({ key: b64u.decode(pin.signingKey), old: null });
    if (at !== null) for (const e of pin?.earlier ?? []) if (at < e.until) out.push({ key: b64u.decode(e.signingKey), old: memberFingerprint(e.publicKey, e.signingKey) });
    // a key they replaced, wallet-signed when it was published, counts for what was signed while
    // it was theirs, on the same terms as a key they have now that nobody here confirmed yet
    if (at !== null && counts) {
      for (const e of (await keyDirectory.earlier()).get(userId) ?? []) if (at < e.until) out.push({ key: b64u.decode(e.signingKey), old: memberFingerprint(e.publicKey, e.signingKey) });
    }
    return out;
  },

  // Whether `by` signed something, as `check` tells for one signing key: null when no key of
  // theirs checks out, otherwise the fingerprint of the earlier key that did, or null for the
  // current one.
  async author(by: string, at: number | null, check: (signingKey: Uint8Array) => boolean, options: { former?: boolean } = {}): Promise<{ old: string | null } | null> {
    for (const signer of await keyDirectory.signers(by, at, options)) if (check(signer.key)) return { old: signer.old };
    return null;
  },
};

export default keyDirectory;
