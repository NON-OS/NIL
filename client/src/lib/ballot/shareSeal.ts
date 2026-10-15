import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from '../crypto/aesGcm';
import b64u from '../crypto/b64u';

// Seals a trustee's key share to one trustee's encryption key (X25519 + HKDF + AES-GCM), bound
// to the vote and the two seats so a share can't be replayed into another vote or seat.
const shareSeal = {
  async seal(share: Uint8Array, recipient: Uint8Array, context: string) {
    const ephemeral = x25519.utils.randomPrivateKey();
    const ephemeralPublic = x25519.getPublicKey(ephemeral);
    const key = hkdf(sha256, x25519.getSharedSecret(ephemeral, recipient), concatBytes(ephemeralPublic, recipient), utf8ToBytes(`nonos/vote-share/v1/${context}`), 32);
    return b64u.encode(concatBytes(ephemeralPublic, await aesGcm.seal(key, share, utf8ToBytes(context))));
  },

  async open(sealed: string, privateKey: Uint8Array, publicKey: Uint8Array, context: string) {
    const bytes = b64u.decode(sealed);
    const ephemeralPublic = bytes.subarray(0, 32);
    const key = hkdf(sha256, x25519.getSharedSecret(privateKey, ephemeralPublic), concatBytes(ephemeralPublic, publicKey), utf8ToBytes(`nonos/vote-share/v1/${context}`), 32);
    return aesGcm.open(key, bytes.subarray(32), utf8ToBytes(context));
  },
};

export default shareSeal;
