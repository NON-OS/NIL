import http from '../api/http';
import store from '../state/store';
import keyring from '../state/keyring';
import ethereum from '../lib/ethereum';
import keyMessage from '../lib/crypto/keyMessage';
import b64u from '../lib/crypto/b64u';
import records from '../state/records';
import sealedCache from '../state/sealedCache';
import revealTask from '../state/revealTask';
import openSealed from './openSealed';
import taskHandover from './taskHandover';

async function sign() {
  const { me } = store.get();
  const { key } = await http.get<{ key: string }>('/proofs/key');
  const { address } = await ethereum.account();
  return ethereum.sign(keyMessage({ workspaceKey: key, userId: me!.id }), address);
}

// Unlocks encrypted docs and private tasks for this tab. The first time, it signs twice to make sure the wallet
// signs deterministically; a wallet that doesn't would lose access to everything later.
const vault = {
  unlocked: () => keyring.identity() !== null,

  async unlock({ reset = false } = {}) {
    if (keyring.identity() && !reset) return;
    const me = store.get().me!;
    const keys = await http.get<{ userId: string; publicKey: string }[]>('/encryption-keys');
    const registered = keys.find((k) => k.userId === me.id)?.publicKey;
    // the key derivation loads on first unlock rather than with the app
    const { default: identityFromSignature } = await import('../lib/crypto/identityFromSignature');
    const identity = identityFromSignature(await sign());
    const publicKey = b64u.encode(identity.publicKey);

    if (registered && registered !== publicKey && !reset) {
      throw new Error('This wallet unlocks a different key than the one your docs are sealed to. Switch to the wallet you first unlocked docs with.');
    }
    if (!registered || reset) {
      const again = identityFromSignature(await sign());
      if (b64u.encode(again.publicKey) !== publicKey) {
        throw new Error('Your wallet signs the same message differently each time, so it can’t hold an encryption key. Wallets like MetaMask, Rabby, Ledger and Trezor work.');
      }
      await http.put('/me/encryption-key', { publicKey, reset });
    }
    keyring.unlock(identity);
    store.set({ docsUnlocked: true });
    await openSealed();
    void taskHandover();
  },

  // Forgets every key and every opened private task; they show as locked again.
  lock() {
    keyring.lock();
    sealedCache.clear();
    store.set((s) => ({
      docsUnlocked: false,
      tasks: records.fromList(Object.values(s.tasks).map((t) => (t.sealed ? revealTask({ ...t, locked: undefined }) : t))),
    }));
  },
};

export default vault;
