import store from '../state/store';
import keyring from '../state/keyring';
import b64u from '../lib/crypto/b64u';
import keyDirectory from './keyDirectory';
import confirmKeys from './confirmKeys';
import type SealedTask from '../types/SealedTask';

export interface TaskKey {
  id: string;
  key: Uint8Array;
}

// The key-wrapping maths is a large share of the app and is only needed once someone unlocks,
// so it loads on first use.
const sealer = async () => (await import('../lib/crypto/taskKeySeal')).default;

function identity() {
  const id = keyring.identity();
  if (!id) throw new Error('Unlock with your wallet to open private tasks.');
  return id;
}

// The keys behind private tasks: this person's own copy unwrapped from a task, fresh ones for
// a task that turns private or changes hands, and each wrapped for whoever may read it.
const taskKeys = {
  async open(sealed: SealedTask): Promise<TaskKey> {
    const cached = keyring.taskKey(sealed.id);
    if (cached) return { id: sealed.id, key: cached };
    const { privateKey, publicKey } = identity();
    const wrapped = sealed.keys[store.get().me!.id];
    if (!wrapped) throw new Error('This private task hasn’t been shared with your key yet.');
    const taskKeySeal = await sealer();
    const key = await taskKeySeal.open(wrapped, privateKey, publicKey);
    keyring.rememberTaskKey(sealed.id, key);
    return { id: sealed.id, key };
  },

  fresh(): TaskKey {
    const id = b64u.encode(crypto.getRandomValues(new Uint8Array(16)));
    const key = crypto.getRandomValues(new Uint8Array(32));
    keyring.rememberTaskKey(id, key);
    return { id, key };
  },

  // Your own copy goes to your unlocked key; the other person's only to a key you've confirmed.
  // With `ask`, you're offered the chance to confirm a new or changed key first. Anyone left out
  // gets the key handed over later, once confirmed (see taskHandover).
  async wrap(key: Uint8Array, people: (string | null)[], { ask = false } = {}) {
    const me = store.get().me!.id;
    const others = people.filter((p): p is string => Boolean(p) && p !== me);
    if (ask && others.length) await confirmKeys.ask(others, 'this private task').catch(() => {});
    const taskKeySeal = await sealer();
    const keys: Record<string, string> = {};
    if (people.includes(me)) keys[me] = await taskKeySeal.seal(key, identity().publicKey);
    for (const [userId, publicKey] of await keyDirectory.sharable(others)) keys[userId] = await taskKeySeal.seal(key, publicKey);
    return keys;
  },
};

export default taskKeys;
