import type KeyEntry from './KeyEntry';

// A published key whose wallet signature checked out, measured against what this browser pinned.
// 'new': first seen here, not yet confirmed. 'changed': differs from the pinned key.
export default interface MemberKey extends KeyEntry {
  fingerprint: string;
  state: 'confirmed' | 'new' | 'changed';
  // the pinned key's fingerprint when the published one differs from it
  previousFingerprint: string | null;
  // what this member's signatures are checked against: the pinned key, until a change is confirmed
  trustedSigningKey: string;
}
