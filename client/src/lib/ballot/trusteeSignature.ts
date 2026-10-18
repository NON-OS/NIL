import { ed25519 } from '@noble/curves/ed25519';
import { utf8ToBytes } from '@noble/hashes/utils';
import b64u from '../crypto/b64u';

// Ed25519 over a trustee statement, as base64url: made with this trustee's own signing key, and
// checked against the key this browser pinned for the trustee who is said to have made it.
const trusteeSignature = {
  sign: (text: string, signingPrivate: Uint8Array) => b64u.encode(ed25519.sign(utf8ToBytes(text), signingPrivate)),

  verify(signature: unknown, text: string, signingKey: Uint8Array) {
    if (typeof signature !== 'string') return false;
    try {
      return ed25519.verify(b64u.decode(signature), utf8ToBytes(text), signingKey);
    } catch {
      return false;
    }
  },
};

export default trusteeSignature;
