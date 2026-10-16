export default interface NoxInfo {
  token: string;
  chainId: number;
  symbol: string;
  decimals: number;
  explorer: string;
  // what NOX keeps of a transfer between wallets, in basis points; 0 when it keeps nothing
  transferFeeBps?: number;
}
