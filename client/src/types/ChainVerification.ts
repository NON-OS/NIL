// Whether the server could verify its chain reads lately (server/chain/verifyHealth.js). Sent to
// admins only.
export default interface ChainVerification {
  required: boolean;
  ok: boolean;
  reason: string | null;
  since: string | null;
  // when the Ethereum node last gave an answer that failed its proof, within the last day
  mismatchAt: string | null;
}
