import { ed25519, x25519 } from '@noble/curves/ed25519';
import seedKey from './seedKey';
import type Identity from '../../types/Identity';

// A member's identity is one random 32-byte seed, made in their browser the first time they
// unlock. It doesn't come from a wallet signature, so it isn't tied to any one wallet: every
// linked wallet holds a wrapped copy, and a recovery kit can hold one too.
export default function identityFromSeed(seed: Uint8Array): Identity {
  const privateKey = seedKey(seed, 'x25519 encryption key');
  const signingPrivate = seedKey(seed, 'ed25519 signing key');
  return { seed, privateKey, publicKey: x25519.getPublicKey(privateKey), signingPrivate, signingKey: ed25519.getPublicKey(signingPrivate) };
}
