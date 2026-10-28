import { utf8ToBytes } from '@noble/hashes/utils';
import store from '../../state/store';
import keyring from '../../state/keyring';
import aesGcm from '../crypto/aesGcm';
import idbStore from './idbStore';
import localKey, { type LocalScope } from './localKey';

function scope() {
  const s = store.get();
  if (!s.me) return null;
  const at: LocalScope = { origin: s.origin, workspaceKey: s.workspaceKey, userId: s.me.id };
  return { scope: at, prefix: `${localKey.label(at)}:` };
}

function current() {
  const identity = keyring.identity();
  const at = scope();
  return identity && at ? { identity, ...at } : null;
}

const where = (prefix: string, use: string, name: string) => `${prefix}${use}:${name}`;

// Records this browser keeps between visits, such as changes that couldn't be sent yet. Each is
// encrypted under a key that comes from the unlocked identity, with its place as the additional
// data, so what sits on disk is ciphertext that only this member, signed in here, can open.
// While the keys are locked nothing is read or written.
const sealedLocal = {
  async put(use: string, name: string, bytes: Uint8Array) {
    const at = current();
    if (!at) return false;
    const key = localKey.key(at.identity, at.scope, use);
    const place = where(at.prefix, use, name);
    try {
      await idbStore.put(place, await aesGcm.seal(key, bytes, utf8ToBytes(place)));
      return true;
    } catch {
      return false;
    } finally {
      key.fill(0);
    }
  },

  async get(use: string, name: string) {
    const at = current();
    if (!at) return null;
    const place = where(at.prefix, use, name);
    const key = localKey.key(at.identity, at.scope, use);
    try {
      const sealed = await idbStore.get(place);
      return sealed ? await aesGcm.open(key, sealed, utf8ToBytes(place)) : null;
    } catch {
      // unreadable: written under another identity or damaged, so it's of no use to anyone
      await idbStore.remove(place).catch(() => {});
      return null;
    } finally {
      key.fill(0);
    }
  },

  async remove(use: string, name: string) {
    const at = current();
    if (at) await idbStore.remove(where(at.prefix, use, name)).catch(() => {});
  },

  // the names kept for this use whose names start with `start`
  async names(use: string, start = '') {
    const at = current();
    if (!at) return [];
    const head = where(at.prefix, use, start);
    const cut = where(at.prefix, use, '').length;
    return (await idbStore.keys(head).catch(() => [] as string[])).map((k) => k.slice(cut));
  },

  // everything this account kept for one use, locked or not: for what goes with the session
  async forget(use: string) {
    const at = scope();
    if (!at) return;
    for (const k of await idbStore.keys(where(at.prefix, use, '')).catch(() => [] as string[])) await idbStore.remove(k).catch(() => {});
  },

  // everything this account kept in this browser, locked or not, for when its keys are revoked
  async wipe() {
    const at = scope();
    if (!at) return;
    for (const k of await idbStore.keys(at.prefix).catch(() => [] as string[])) await idbStore.remove(k).catch(() => {});
  },
};

export default sealedLocal;
