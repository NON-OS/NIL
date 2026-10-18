import { ed25519 } from '@noble/curves/ed25519';
import { utf8ToBytes } from '@noble/hashes/utils';

// Signs a trustee statement as a trustee's browser does: Ed25519 with the signing key their
// published keys name (`signer` from publishKey), as base64url.
export default function trusteeSign(signer, text) {
  return Buffer.from(ed25519.sign(utf8ToBytes(text), signer.signingPrivate)).toString('base64url');
}
