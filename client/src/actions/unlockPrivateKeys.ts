import store from '../state/store';
import keyring from '../state/keyring';
import privateKeys from '../state/privateKeys';
import privateKeysFromSeed from '../lib/crypto/privateKeysFromSeed';
import metaAddress from '../lib/stealth/metaAddress';
import vault from './vault';
import registerVotingKey from './registerVotingKey';
import type PrivateKeys from '../types/PrivateKeys';

// Your private-payout and anonymous-voting keys, derived from your identity once it's unlocked.
// They follow your identity to every wallet you link and into your recovery kit.
export default async function unlockPrivateKeys(): Promise<PrivateKeys> {
  const held = privateKeys.get();
  if (held) return held;
  await vault.unlock();
  const keys = privateKeysFromSeed(keyring.identity()!.seed);
  const registered = store.get().me?.stealthMeta;
  if (registered && registered !== metaAddress(keys.spendingKey, keys.viewingKey)) {
    for (const k of Object.values(keys)) k.fill(0);
    throw new Error('Private payouts were turned on with keys from before your last key reset. Restore your recovery kit to reach payouts sent before then, or turn private payouts off and on again to use your current keys.');
  }
  privateKeys.set(keys);
  // Unlocking is also when a member joins anonymous votes, long before any ballot. A failure here
  // (a key switch blocked by an open vote, say) mustn't stop payouts from unlocking.
  await registerVotingKey(keys).catch(() => {});
  return keys;
}
