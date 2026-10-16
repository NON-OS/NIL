import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

// The hash a trustee commits to before anyone reveals: their two coefficient commitments, bound
// to the vote and the seat. Must match server/votes/encrypted/dealingCommit.js byte for byte.
export default function dealingCommit(proposalId: string, position: number, commitments: [bigint, bigint][]) {
  const text = `nil/dealing-commit/v1|${proposalId}|${position}|${commitments.map((p) => `${p[0]},${p[1]}`).join('|')}`;
  return bytesToHex(sha256(utf8ToBytes(text)));
}
