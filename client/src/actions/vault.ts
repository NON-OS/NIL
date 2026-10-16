import ApiError from '../api/ApiError';
import store from '../state/store';
import keyring from '../state/keyring';
import privateKeys from '../state/privateKeys';
import records from '../state/records';
import sealedCache from '../state/sealedCache';
import revealTask from '../state/revealTask';
import ethereum from '../lib/ethereum';
import VaultError from '../lib/VaultError';
import b64u from '../lib/crypto/b64u';
import identityFromSeed from '../lib/crypto/identityFromSeed';
import forgetIdentity from '../lib/crypto/forgetIdentity';
import memberFingerprint from '../lib/crypto/memberFingerprint';
import keyDirectory from './keyDirectory';
import walletWraps from './walletWraps';
import publishKeys from './publishKeys';
import openSealed from './openSealed';
import taskHandover from './taskHandover';
import type Identity from '../types/Identity';

const sameKeys = (identity: Identity, listed: { publicKey: string; signingKey: string }) => listed.publicKey === b64u.encode(identity.publicKey) && listed.signingKey === b64u.encode(identity.signingKey);

// A brand-new identity: a random seed, wrapped for this wallet and published with its signature.
async function create(address: string, reset: boolean) {
  const identity = identityFromSeed(crypto.getRandomValues(new Uint8Array(32)));
  try {
    await publishKeys(identity, address, { reset, wrap: await walletWraps.make(identity.seed, address) });
  } catch (err) {
    forgetIdentity(identity);
    // keys on record that the listing hides, because the wallet that signed them was unlinked
    if (err instanceof ApiError && err.status === 409) throw new VaultError('no-wrap', 'Your keys were set up with a wallet that’s no longer linked to your account. Restore from your recovery kit, or start over with new keys.');
    throw err;
  }
  await vault.adopt(identity);
}

// Opens this wallet's wrap of your identity, or makes your identity the first time.
async function unlockWithWallet(reset: boolean) {
  const { address } = await ethereum.account();
  if (reset) {
    vault.lock();
    return create(address, true);
  }
  const [keys, wraps] = await Promise.all([keyDirectory.load({ fresh: true }), walletWraps.list()]);
  const listed = keys.get(store.get().me!.id);
  const wrap = wraps.find((w) => w.address === address.toLowerCase());
  if (!wrap) {
    if (listed || wraps.length) throw new VaultError('no-wrap', 'This wallet doesn’t unlock your keys yet. Unlock once with a wallet that does and add this one in Settings, under Security, or restore from your recovery kit.');
    return create(address, false);
  }
  const identity = identityFromSeed(await walletWraps.open(wrap, address));
  if (listed && !sameKeys(identity, listed)) {
    forgetIdentity(identity);
    throw new VaultError('mismatch', 'The server lists different keys for you than the ones your wallet unlocks. If you didn’t reset your keys on another device, tell your admin before doing anything else.');
  }
  // the wallet that signed your keys was unlinked, so the listing dropped them: sign again
  if (!listed) await publishKeys(identity, address);
  await vault.adopt(identity);
}

// One unlock at a time: a second caller waits for the first instead of asking the wallet again.
let unlocking: Promise<void> | null = null;

// Unlocks encrypted docs, private tasks, payouts and votes for this tab. Your identity is a
// random key made in your browser, stored on the server only wrapped once per linked wallet,
// so any of your wallets opens it and the server never can.
const vault = {
  unlocked: () => keyring.identity() !== null,

  fingerprint() {
    const id = keyring.identity();
    return id ? memberFingerprint(b64u.encode(id.publicKey), b64u.encode(id.signingKey)) : null;
  },

  async unlock({ reset = false } = {}) {
    if (keyring.identity() && !reset) return;
    if (unlocking) return unlocking;
    unlocking = unlockWithWallet(reset).finally(() => (unlocking = null));
    return unlocking;
  },

  // Takes an opened identity into this tab, then opens what was waiting on it.
  async adopt(identity: Identity) {
    keyring.unlock(identity);
    store.set((s) => ({ docsUnlocked: true, keysRev: s.keysRev + 1 }));
    await openSealed();
    void taskHandover();
  },

  // Adds a wrap for the wallet now in the browser, so it opens the same identity from now on.
  async addWallet() {
    const identity = keyring.identity();
    if (!identity) throw new Error('Unlock your keys first.');
    const { address } = await ethereum.account();
    if ((await walletWraps.list()).some((w) => w.address === address.toLowerCase())) return false;
    await walletWraps.save(await walletWraps.make(identity.seed, address));
    return true;
  },

  wallets: () => walletWraps.list().then((wraps) => wraps.map((w) => w.address)),

  // Forgets every key and every opened private task; they show as locked again.
  lock() {
    keyring.lock();
    privateKeys.lock();
    sealedCache.clear();
    store.set((s) => ({
      docsUnlocked: false,
      tasks: records.fromList(Object.values(s.tasks).map((t) => (t.sealed ? revealTask({ ...t, locked: undefined }) : t))),
    }));
  },
};

export default vault;
