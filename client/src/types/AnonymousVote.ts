export default interface AnonymousVote {
  scope: string;
  depth: number;
  // the voter tree in order; a removed member keeps their position with an empty leaf
  members: { commitment: string; removed?: boolean }[];
  nullifiers: string[];
}
