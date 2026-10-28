import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';
import store from '../state/store';
import keyring from '../state/keyring';
import b64u from './crypto/b64u';
import localKey from './sealedLocal/localKey';
import sealedLocal from './sealedLocal/sealedLocal';

// What chat keeps on this device between visits: messages already signed and encrypted, waiting
// to be sent, with their encrypted files; the search index, encrypted under a key of its own;
// and the member lists this browser already checked, with its own sealed copies of each key, so
// a visit picks up where the last one left off. All of it goes through sealedLocal, so even what
// a queued message is, where it goes and who it mentions is ciphertext on the disk, readable only
// with this member's keys unlocked here. Locked, nothing is read or written.
export type Shelf = 'queue' | 'files' | 'search' | 'rosters';

const use = (shelf: Shelf) => `chat-${shelf}`;

// What a record is filed under on the disk: a keyed hash of its name, so not even which
// conversation it's about shows. The name itself goes inside, encrypted with the rest.
function filed(shelf: Shelf, key: string) {
  const identity = keyring.identity();
  const { origin, workspaceKey, me } = store.get();
  if (!identity || !me) return null;
  const secret = localKey.key(identity, { origin, workspaceKey, userId: me.id }, 'chat-names');
  try {
    return b64u.encode(hmac(sha256, secret, utf8ToBytes(`${shelf}:${key}`)));
  } finally {
    secret.fill(0);
  }
}

const SHELVES: Shelf[] = ['queue', 'files', 'search', 'rosters'];
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

// a value put in as bytes comes back as bytes
const unwrap = (v: unknown) => (v && typeof v === 'object' && 'bytes' in v && Object.keys(v).length === 1 ? b64u.decode((v as { bytes: string }).bytes) : v);

function decode<T>(bytes: Uint8Array | null): T | null {
  try {
    return bytes?.length ? (JSON.parse(new TextDecoder().decode(bytes)) as T) : null;
  } catch {
    return null;
  }
}

const chatDisk = {
  async get<T>(shelf: Shelf, key: string): Promise<T | null> {
    const name = filed(shelf, key);
    const held = name ? decode<[string, T]>(await sealedLocal.get(use(shelf), name)) : null;
    return held && held[0] === key ? (unwrap(held[1]) as T) : null;
  },

  async put(shelf: Shelf, key: string, value: unknown) {
    const name = filed(shelf, key);
    // bytes ride inside the JSON as base64url, so the name can go with them
    if (name) await sealedLocal.put(use(shelf), name, encode([key, value instanceof Uint8Array ? { bytes: b64u.encode(value) } : value]));
  },

  async drop(shelf: Shelf, key: string) {
    const name = filed(shelf, key);
    if (name) await sealedLocal.remove(use(shelf), name);
  },

  // every entry whose name starts with `prefix`, as [name, value]; the names are inside, so
  // this opens each one kept for the shelf
  async list<T>(shelf: Shelf, prefix: string): Promise<[string, T][]> {
    const out: [string, T][] = [];
    for (const name of await sealedLocal.names(use(shelf))) {
      const held = decode<[string, T]>(await sealedLocal.get(use(shelf), name));
      if (held && held[0].startsWith(prefix)) out.push([held[0], unwrap(held[1]) as T]);
    }
    return out;
  },

  // with no prefix, everything chat kept for this account, keys locked or not, as at sign-out
  async clear(prefix: string) {
    if (!prefix) return void (await Promise.all(SHELVES.map((s) => sealedLocal.forget(use(s)))));
    for (const shelf of SHELVES) for (const [key] of await chatDisk.list(shelf, prefix)) await chatDisk.drop(shelf, key);
  },
};

export default chatDisk;
