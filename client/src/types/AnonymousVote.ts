export default interface AnonymousVote {
  scope: string;
  depth: number;
  // the voter tree in order; a removed member keeps their position with an empty leaf
  // in a weighted vote each member also carries their snapshotted power, in whole NOX
  members: { commitment: string; removed?: boolean; power?: string }[];
  nullifiers: string[];
}
