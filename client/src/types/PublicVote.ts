// A public vote as anyone sees it on its own page: no member names, only wallets.
export default interface PublicVote {
  id: string;
  workspace: string | null;
  title: string;
  body: string;
  options: string[];
  sealed: boolean;
  open: boolean;
  closesAt: number;
  closedAt: number | null;
  voters: number;
  // null while a sealed vote is open
  totals: string[] | null;
  ballots: { address: string; choice: number; weight: string; castAt: number }[] | null;
  snapshot: {
    block: number;
    chainId: number;
    token: { address: string | null; symbol: string; decimals: number };
    staking: string | null;
    zsp: string | null;
    zspPower: string | null;
  };
}
