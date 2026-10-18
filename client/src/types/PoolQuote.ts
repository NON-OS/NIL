// The relayer's signed price for one pool payout, checked by the server: withdraw `gross` so
// exactly the bounty arrives, `fee` of it going to the relayer.
export default interface PoolQuote {
  feeBps: string;
  gross: string;
  fee: string;
  extraGas: boolean;
  expiresAt: number;
  entrypoint: string;
  scope: string;
  withdrawalData: string;
  feeCommitment: Record<string, unknown>;
}
