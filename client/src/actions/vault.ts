import ApiError from '../api/ApiError';
import store from '../state/store';
import keyring from '../state/keyring';
import privateKeys from '../state/privateKeys';
import records from '../state/records';
import sealedCache from '../state/sealedCache';
import revealTask from '../state/revealTask';
import lockedDetail from '../state/lockedDetail';
import hadKeys from '../state/hadKeys';
import signing from '../state/signing';
import ethereum from '../lib/ethereum';
import VaultError from '../lib/VaultError';
import b64u from '../lib/crypto/b64u';
import forgetIdentity from '../lib/crypto/forgetIdentity';
import memberFingerprint from '../lib/crypto/memberFingerprint';
import keyDirectory from './keyDirectory';
import walletWraps from './walletWraps';
import passkeys from './passkeys';
import publishKeys from './publishKeys';
import openSealed from './openSealed';
import taskHandover from './taskHandover';
import detail from './detail';
import type Identity from '../types/Identity';

// the key maths loads on first unlock rather than with the app
const fromSeed = async (seed: Uint8Array) => (await import('../lib/crypto/identityFromSeed')).default(seed);

type Listed = { publicKey: string; signingKey: string };
const sameKeys = (identity: Identity, listed: Listed) => listed.publicKey === b64u.encode(identity.publicKey) && listed.signingKey === b64u.encode(identity.signingKey);

// Nothing on record for you, yet this browser has seen you hold keys: new ones only when you say so.
const missing = () => new VaultError('missing', 'Your keys seem to be missing from the server. Restore them from your recovery kit, or start over with new keys. If you didn’t reset them yourself, tell your admin first.');

// A brand-new identity: a random seed, wrapped for this wallet and published with its signature.
// That's three signatures in a row, so the signing guide says what each one is for.
async function create(address: string, reset: boolean) {
  const identity = await fromSeed(crypto.getRandomValues(new Uint8Array(32)));
  try {
    await signing.run('keys', async () => publishKeys(identity, address, { reset, wrap: await walletWraps.make(identity.seed, address) }));
  } catch (err) {
    forgetIdentity(identity);
    // keys on record that the listing hides, because the wallet that signed them was unlinked
    if (err instanceof ApiError && err.status === 409) throw new VaultError('no-wrap', 'Your keys were set up with a wallet that’s no longer linked to your account. Restore from your recovery kit, or start over with new keys.');
    throw err;
  }
  await vault.adopt(identity);
}

// How every unlock ends, whichever wrap opened: the seed must derive the keys published for you,
// or it's forgotten and refused.
async function take(identity: Identity, listed: Listed | undefined, opener: string, address?: string) {
  if (listed && !sameKeys(identity, listed)) {
    forgetIdentity(identity);
    throw new VaultError('mismatch', `The server lists different keys for you than the ones ${opener} unlocks. If you didn’t reset your keys on another device, tell your admin before doing anything else.`);
  }
  try {
    // the wallet that signed your keys was unlinked, so the listing dropped them: sign again
    if (!listed) await publishKeys(identity, address ?? (await ethereum.account()).address);
  } catch (err) {
    forgetIdentity(identity);
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
    if (listed || wraps.length) throw new VaultError('no-wrap', 'This wallet doesn’t unlock your keys yet. Unlock once with a wallet that does and add this one in Settings, under Sign-in & security, or restore from your recovery kit.');
    if (hadKeys()) throw missing();
    return create(address, false);
  }
  await take(await fromSeed(await walletWraps.open(wrap, address)), listed, 'your wallet', address);
}

// Opens the wrap of whichever of your passkeys you use. The passkey is asked first, while the
// click that started this still counts as the person's own gesture.
async function unlockWithPasskey() {
  // with no passkey listed nothing needs the gesture, so the server can be asked first
  if (!store.get().passkeys.length && hadKeys()) {
    const [keys, wraps] = await Promise.all([keyDirectory.load({ fresh: true }), walletWraps.list()]);
    if (!keys.get(store.get().me!.id) && !wraps.length) throw missing();
  }
  const { seed, id } = await passkeys.open();
  const identity = await fromSeed(seed);
  let listed: Listed | undefined;
  try {
    listed = (await keyDirectory.load({ fresh: true })).get(store.get().me!.id);
  } catch (err) {
    forgetIdentity(identity);
    throw err;
  }
  await take(identity, listed, 'your passkey');
  void passkeys.used(id);
}

// One unlock at a time: a second caller waits for the first instead of asking the wallet again.
let unlocking: Promise<void> | null = null;

// Unlocks encrypted docs, private tasks, payouts and votes for this tab. Your identity is a
// random key made in your browser, stored on the server only wrapped once per linked wallet and
// once per passkey you add, so any of those opens it and the server never can.
const vault = {
  unlocked: () => keyring.identity() !== null,

  fingerprint() {
    const id = keyring.identity();
    return id ? memberFingerprint(b64u.encode(id.publicKey), b64u.encode(id.signingKey)) : null;
  },

  async unlock({ reset = false, passkey = false } = {}) {
    if (keyring.identity() && !reset) return;
    if (unlocking) return unlocking;
    unlocking = (passkey ? unlockWithPasskey() : unlockWithWallet(reset)).finally(() => (unlocking = null));
    return unlocking;
  },

  // Takes an opened identity into this tab, then opens what was waiting on it.
  async adopt(identity: Identity) {
    keyring.unlock(identity);
    store.set((s) => ({ docsUnlocked: true, keysRev: s.keysRev + 1 }));
    await openSealed();
    // an open task panel loaded while locked holds comments and files it couldn't open yet
    const open = store.get().detail?.taskId;
    if (open) void detail.load(open);
    void taskHandover();
  },

  // Adds a wrap for the wallet now in the browser, so it opens the same identity from now on.
  async addWallet() {
    const identity = keyring.identity();
    if (!identity) throw new Error('Unlock your keys first.');
    const { address } = await ethereum.account();
    if ((await walletWraps.list()).some((w) => w.address === address.toLowerCase())) return false;
    await walletWraps.save(await signing.run('addWallet', () => walletWraps.make(identity.seed, address)));
    return true;
  },

  wallets: () => walletWraps.list().then((wraps) => wraps.map((w) => w.address)),

  // Forgets every key and every opened private task, comment and file; they show as locked again.
  lock() {
    keyring.lock();
    privateKeys.lock();
    sealedCache.clear();
    store.set((s) => ({
      docsUnlocked: false,
      tasks: records.fromList(Object.values(s.tasks).map((t) => (t.sealed ? revealTask({ ...t, locked: undefined }) : t))),
      detail: s.detail && lockedDetail(s.detail),
    }));
  },
};

export default vault;
