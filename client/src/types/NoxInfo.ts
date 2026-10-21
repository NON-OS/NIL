import type ChainVerification from './ChainVerification';

export default interface NoxInfo {
  token: string;
  chainId: number;
  symbol: string;
  decimals: number;
  explorer: string;
  // what NOX keeps of a transfer between wallets, in basis points; 0 when it keeps nothing
  transferFeeBps?: number;
  // false where only official workspaces may put a vote to every holder
  publicVotes?: boolean;
  // admins only: whether what the Ethereum node says can be verified right now
  verification?: ChainVerification;
}
