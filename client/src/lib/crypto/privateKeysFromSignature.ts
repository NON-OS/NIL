import { secp256k1 } from '@noble/curves/secp256k1';
import { mapHashToField } from '@noble/curves/abstract/modular';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import type PrivateKeys from '../../types/PrivateKeys';

// One deterministic wallet signature, stretched into three independent secrets. Each secp256k1
// key comes from 48 bytes mapped into the scalar range, which keeps the bias below 2^-128.
export default function privateKeysFromSignature(signature: string): PrivateKeys {
  const ikm = hexToBytes(signature.replace(/^0x/, ''));
  const expand = (label: string, length: number) => hkdf(sha256, ikm, utf8ToBytes('nonos/private-keys/v1'), utf8ToBytes(label), length);
  return {
    spendingKey: mapHashToField(expand('stealth spending key', 48), secp256k1.CURVE.n),
    viewingKey: mapHashToField(expand('stealth viewing key', 48), secp256k1.CURVE.n),
    semaphoreSecret: expand('semaphore identity', 32),
  };
}
