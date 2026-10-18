// One deposit the team made into a Privacy Pools pool, and what is left of it. The secrets that
// spend it aren't stored: they come from the pool key, the pool's scope and `index`, and after
// each withdrawal from the label and the number of withdrawals so far (`spends`).
export default interface PoolNote {
  symbol: string;
  scope: string;
  index: number;
  // set once the deposit is mined
  label: string | null;
  // the wallet that deposited; only it can take the money back with a ragequit
  depositor: string;
  txHash: string | null;
  // what the pool credited, after its vetting fee
  deposited: string;
  value: string;
  spends: number;
  state: 'sending' | 'open' | 'spent' | 'exited' | 'failed';
  // a withdrawal handed to the relayer whose outcome this browser didn't learn
  pending: { intentId: string; gross: string; at: number } | null;
  payouts: { intentId: string; txHash: string | null; gross: string; at: number }[];
  createdAt: number;
}
