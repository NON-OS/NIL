import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { utf8ToBytes } from '@noble/hashes/utils';
import b64u from '../crypto/b64u';
import type Identity from '../../types/Identity';

export interface LocalScope {
  origin: string;
  workspaceKey: string;
  userId: string;
}

const scopeText = (s: LocalScope) => JSON.stringify([s.origin, s.workspaceKey, s.userId]);

// The key this browser keeps local records under, for one use. It comes from the member's
// identity, so it exists only while their keys are unlocked, and from the site, workspace and
// account, so records from one never open under another.
const localKey = {
  key: (identity: Identity, scope: LocalScope, use: string) => hkdf(sha256, identity.seed, utf8ToBytes(scopeText(scope)), utf8ToBytes(`nil/local/${use}/v1`), 32),
  // a name for the scope that doesn't spell out the account
  label: (scope: LocalScope) => b64u.encode(sha256(utf8ToBytes(scopeText(scope)))).slice(0, 22),
};

export default localKey;
