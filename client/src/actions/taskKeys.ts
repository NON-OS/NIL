import http from '../api/http';
import store from '../state/store';
import keyring from '../state/keyring';
import taskKeySeal from '../lib/crypto/taskKeySeal';
import b64u from '../lib/crypto/b64u';
import type SealedTask from '../types/SealedTask';

export interface TaskKey {
  id: string;
  key: Uint8Array;
}

// The keys behind private tasks: this person's own copy unwrapped from a task, fresh ones for
// a task that turns private or changes hands, and each wrapped for whoever may read it.
const taskKeys = {
  async open(sealed: SealedTask): Promise<TaskKey> {
    const cached = keyring.taskKey(sealed.id);
    if (cached) return { id: sealed.id, key: cached };
    const identity = keyring.identity();
    if (!identity) throw new Error('Unlock with your wallet to open private tasks.');
    const wrapped = sealed.keys[store.get().me!.id];
    if (!wrapped) throw new Error('This private task hasn’t been shared with your key yet.');
    const key = await taskKeySeal.open(wrapped, identity.privateKey, identity.publicKey);
    keyring.rememberTaskKey(sealed.id, key);
    return { id: sealed.id, key };
  },

  fresh(): TaskKey {
    const id = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
    const key = crypto.getRandomValues(new Uint8Array(32));
    keyring.rememberTaskKey(id, key);
    return { id, key };
  },

  // People who haven't unlocked yet get skipped; a teammate's browser hands them the key later.
  async wrap(key: Uint8Array, people: (string | null)[]) {
    const directory = new Map((await http.get<{ userId: string; publicKey: string }[]>('/encryption-keys')).map((k) => [k.userId, k.publicKey]));
    const keys: Record<string, string> = {};
    for (const userId of new Set(people.filter((p): p is string => Boolean(p)))) {
      const publicKey = directory.get(userId);
      if (publicKey) keys[userId] = await taskKeySeal.seal(key, b64u.decode(publicKey));
    }
    return keys;
  },
};

export default taskKeys;
