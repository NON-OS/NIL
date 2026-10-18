// Whether the server could verify its chain reads lately (server/chain/verifyHealth.js). Sent to
// admins only.
export default interface ChainVerification {
  // off: not checked; shadow: checked on the side, nothing waits; enforce: only proven answers count
  mode: 'off' | 'shadow' | 'enforce';
  required: boolean;
  ok: boolean;
  reason: string | null;
  since: string | null;
  // when the Ethereum node last gave an answer that failed its proof, within the last day
  mismatchAt: string | null;
}
