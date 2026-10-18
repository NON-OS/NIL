import type AnonymousVote from './AnonymousVote';
import type EncryptedVote from './EncryptedVote';

type Seat = Pick<EncryptedVote['trustees'][number], 'position' | 'userId' | 'shares'>;

// What a browser proves a ballot from, fetched without its session cookie just before proving,
// so the server can't tell whose fetch it is or hand one member a voter list of its own.
export default interface AnonymousVoteView extends Pick<AnonymousVote, 'scope' | 'depth' | 'members' | 'roots'> {
  id: string;
  optionCount: number;
  open: boolean;
  // the server's clock, which names the hour a ballot is proven in
  now: number;
  encrypted: (Pick<EncryptedVote, 'publicKey' | 'commitments'> & { trustees: Seat[] }) | null;
}
