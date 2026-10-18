import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import storage from '../lib/storage';
import store from './store';
import type Point from '../lib/ballot/point';

// Which sums this browser has given a partial decryption of, by vote, per workspace and account.
// A trustee decrypts once per vote: a second partial of other sums, together with another
// trustee's, would open something other than the totals. Asking again for the very same sums
// (a retry after a dropped connection, say) is fine. A copy in memory keeps the record for the
// session when storage is blocked.
const memory = new Map<string, Record<string, string>>();
const slot = () => {
  const s = store.get();
  return `vote-partials:${s.workspaceKey}:${s.me?.id ?? ''}`;
};
const all = (): Record<string, string> => ({ ...storage.get<Record<string, string>>(slot(), {}), ...memory.get(slot()) });

const partialsMade = {
  digest: (sums: { c1: Point }[]) => bytesToHex(sha256(utf8ToBytes(sums.map((s) => s.c1.join(',')).join('|')))),

  // Whether this browser may decrypt these sums for this vote.
  allows: (proposalId: string, digest: string) => !all()[proposalId] || all()[proposalId] === digest,

  record(proposalId: string, digest: string) {
    const next = { ...all(), [proposalId]: digest };
    memory.set(slot(), next);
    storage.set(slot(), next);
  },
};

export default partialsMade;
