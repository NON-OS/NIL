// One member's signed ballot in a vote whose ballots are public. castAt moves when they change it.
export default interface Ballot {
  userId: string;
  address: string;
  choice: number;
  weight: string;
  castAt: number;
}
