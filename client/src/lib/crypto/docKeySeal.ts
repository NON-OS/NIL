import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from './aesGcm';
import b64u from './b64u';

const INFO = utf8ToBytes('nonos/e2ee/doc-key/v1');

// Sealed-box style: a throwaway key pair agrees on a secret with the recipient's public key,
// and only the recipient's private key can recreate it. Output: ephemeral public key (32),
// IV (12), encrypted doc key with tag (48).
function wrapKey(ephemeralPublic: Uint8Array, recipientPublic: Uint8Array, shared: Uint8Array) {
  return hkdf(sha256, shared, concatBytes(ephemeralPublic, recipientPublic), INFO, 32);
}

const docKeySeal = {
  async seal(docKey: Uint8Array, recipientPublic: Uint8Array) {
    const ephemeral = x25519.utils.randomPrivateKey();
    const ephemeralPublic = x25519.getPublicKey(ephemeral);
    const kek = wrapKey(ephemeralPublic, recipientPublic, x25519.getSharedSecret(ephemeral, recipientPublic));
    return b64u.encode(concatBytes(ephemeralPublic, await aesGcm.seal(kek, docKey, recipientPublic)));
  },

  async open(wrapped: string, privateKey: Uint8Array, publicKey: Uint8Array) {
    const bytes = b64u.decode(wrapped);
    const ephemeralPublic = bytes.subarray(0, 32);
    const kek = wrapKey(ephemeralPublic, publicKey, x25519.getSharedSecret(privateKey, ephemeralPublic));
    return aesGcm.open(kek, bytes.subarray(32), publicKey);
  },
};

export default docKeySeal;
