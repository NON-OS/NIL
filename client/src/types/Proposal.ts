import type AnonymousVote from './AnonymousVote';
import type EncryptedVote from './EncryptedVote';
import type Ballot from './Ballot';

export default interface Proposal {
  id: string;
  title: string;
  body: string;
  options: string[];
  // 'power' counts the voting power snapshotted when the vote opened: NOX held, staked, and ZSPs
  weighting: 'equal' | 'power';
  sealed: boolean;
  // a signed vote whose ballots every member can see, wallet and choice, like a DAO's
  publicBallots: boolean;
  // a public vote: any NOX holder votes on its page at /vote/<slug>, and anyone can watch
  publicVote: { slug: string } | null;
  createdBy: string | null;
  createdAt: number;
  closesAt: number;
  closedAt: number | null;
  voters: number;
  // null while a sealed vote is still open
  totals: string[] | null;
  myVote: { choice: number; weight: string } | null;
  // every ballot, when the ballots are public; null while a sealed vote is open, or when they're not
  ballots: Ballot[] | null;
  // set for anonymous votes, whose ballots are Semaphore proofs instead of signatures
  anonymous: AnonymousVote | null;
  // anonymous and weighted: encrypted ballots, decrypted only as totals by two of three trustees
  encrypted: EncryptedVote | null;
}
