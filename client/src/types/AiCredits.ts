// What the server hands every member for anonymous AI requests: the member list to prove
// against, the day's slots, and today's spent nullifiers.
export default interface AiCredits {
  on: boolean;
  day: string;
  slots: number;
  depth: number;
  members: string[];
  root: string | null;
  spent: string[];
}
