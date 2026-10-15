import http from '../api/http';
import store from '../state/store';
import privateKeys from '../state/privateKeys';
import ethereum from '../lib/ethereum';
import privateKeysMessage from '../lib/crypto/privateKeysMessage';
import privateKeysFromSignature from '../lib/crypto/privateKeysFromSignature';
import metaAddress from '../lib/stealth/metaAddress';
import type PrivateKeys from '../types/PrivateKeys';

const fingerprint = (k: PrivateKeys) => metaAddress(k.spendingKey, k.viewingKey);

async function sign() {
  const { me, workspace } = store.get();
  const [{ key }, { address }] = await Promise.all([http.get<{ key: string }>('/proofs/key'), ethereum.account()]);
  return ethereum.sign(privateKeysMessage({ workspace: workspace.name, workspaceKey: key, userId: me!.id }), address);
}

// Derives your private keys from a wallet signature. Setting them up for the first time signs
// twice, because a wallet that signs non-deterministically would lose every payout sent to it.
export default async function unlockPrivateKeys({ firstTime = false } = {}): Promise<PrivateKeys> {
  const held = privateKeys.get();
  if (held) return held;
  const keys = privateKeysFromSignature(await sign());
  if (firstTime) {
    const again = privateKeysFromSignature(await sign());
    if (fingerprint(again) !== fingerprint(keys)) {
      throw new Error('Your wallet signs the same message differently each time, so it can’t hold private keys. Wallets like MetaMask, Rabby, Ledger and Trezor work.');
    }
  }
  const registered = store.get().me?.stealthMeta;
  if (!firstTime && registered && registered !== fingerprint(keys)) {
    throw new Error('This wallet unlocks different keys than the ones your private payouts use. Switch to the wallet you turned them on with.');
  }
  privateKeys.set(keys);
  return keys;
}
