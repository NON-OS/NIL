import type Identity from '../../types/Identity';

// Overwrites an identity's secrets in place, so a copy that's no longer needed doesn't linger.
export default function forgetIdentity(identity: Identity) {
  for (const secret of [identity.seed, identity.privateKey, identity.signingPrivate]) secret.fill(0);
}
