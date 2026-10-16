import type AnonymousVote from './AnonymousVote';
import type EncryptedVote from './EncryptedVote';

export default interface Proposal {
  id: string;
  title: string;
  body: string;
  options: string[];
  // 'power' counts the voting power snapshotted when the vote opened: NOX held, staked, and ZSPs
  weighting: 'equal' | 'power';
  sealed: boolean;
  createdBy: string | null;
  createdAt: number;
  closesAt: number;
  closedAt: number | null;
  voters: number;
  // null while a sealed vote is still open
  totals: string[] | null;
  myVote: { choice: number; weight: string } | null;
  // set for anonymous votes, whose ballots are Semaphore proofs instead of signatures
  anonymous: AnonymousVote | null;
  // anonymous and weighted: encrypted ballots, decrypted only as totals by two of three trustees
  encrypted: EncryptedVote | null;
}
