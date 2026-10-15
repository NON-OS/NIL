export default interface Proposal {
  id: string;
  title: string;
  body: string;
  options: string[];
  weighting: 'equal' | 'nox';
  sealed: boolean;
  createdBy: string | null;
  createdAt: number;
  closesAt: number;
  closedAt: number | null;
  voters: number;
  // null while a sealed vote is still open
  totals: string[] | null;
  myVote: { choice: number; weight: string } | null;
}
