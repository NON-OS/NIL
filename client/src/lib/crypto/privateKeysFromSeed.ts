import { secp256k1 } from '@noble/curves/secp256k1';
import { mapHashToField } from '@noble/curves/abstract/modular';
import seedKey from './seedKey';
import type PrivateKeys from '../../types/PrivateKeys';

// Payout and anonymous-voting keys from the identity seed. They used to come from a signature of
// their own, which anyone who tricked a wallet into signing that message once could replay; the
// seed never leaves the browser except wrapped. Each secp256k1 key comes from 48 bytes mapped
// into the scalar range, which keeps the bias below 2^-128.
export default function privateKeysFromSeed(seed: Uint8Array): PrivateKeys {
  return {
    spendingKey: mapHashToField(seedKey(seed, 'stealth spending key', 48), secp256k1.CURVE.n),
    viewingKey: mapHashToField(seedKey(seed, 'stealth viewing key', 48), secp256k1.CURVE.n),
    semaphoreSecret: seedKey(seed, 'semaphore identity'),
  };
}
