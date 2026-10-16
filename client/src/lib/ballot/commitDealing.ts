import { Base8, mulPointEscalar } from '@zk-kit/baby-jubjub';
import dealingLine from './dealingLine';
import dealingCommit from './dealingCommit';

// The commitment a trustee posts before any dealing is revealed: the hash of a0·G and a1·G for
// the line their identity gives this vote and seat.
export default function commitDealing(seed: Uint8Array, proposalId: string, position: number) {
  const line = dealingLine(seed, proposalId, position);
  return dealingCommit(proposalId, position, line.map((a) => mulPointEscalar(Base8, a)));
}
