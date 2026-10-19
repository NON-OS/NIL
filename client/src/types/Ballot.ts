// One signed ballot in a vote whose ballots are public. castAt moves when its voter changes it.
// userId is null for a wallet that belongs to no member, voting on a public vote's page.
export default interface Ballot {
  userId: string | null;
  address: string;
  choice: number;
  weight: string;
  castAt: number;
}
