import forgetIdentity from '../lib/crypto/forgetIdentity';
import keyScope from './keyScope';
import type Identity from '../types/Identity';

// The unlocked identity, and the doc and task keys opened with it, live only in this tab's
// memory. Nothing here is written to disk, storage or the server, and all of it is wiped on
// lock, sign-out or reload. Unlocking also records which site, workspace and account the keys
// are for (see keyScope).
let identity: Identity | null = null;
const docKeys = new Map<string, Uint8Array>();
const taskKeys = new Map<string, Uint8Array>();

const keyring = {
  identity: () => identity,
  unlock(next: Identity) {
    try {
      keyScope.bind();
    } catch (err) {
      forgetIdentity(next);
      throw err;
    }
    identity = next;
  },
  docKey: (docId: string) => docKeys.get(docId),
  rememberDocKey: (docId: string, key: Uint8Array) => docKeys.set(docId, key),
  forgetDocKey: (docId: string) => docKeys.delete(docId),
  // private task keys, by seal id
  taskKey: (sealId: string) => taskKeys.get(sealId),
  rememberTaskKey: (sealId: string, key: Uint8Array) => taskKeys.set(sealId, key),
  forgetTaskKey: (sealId: string) => taskKeys.delete(sealId),
  lock() {
    if (identity) forgetIdentity(identity);
    identity = null;
    keyScope.release();
    for (const key of [...docKeys.values(), ...taskKeys.values()]) key.fill(0);
    docKeys.clear();
    taskKeys.clear();
  },
};

export default keyring;
