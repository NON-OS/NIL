export default interface ProofPayment {
  amount: string;
  symbol: string;
  decimals: number;
  chainId: number;
  tx: string;
}
