// What the server says about Privacy Pools: the network, the entry contract, and per reward
// token its pool and the pool's limits, or why there's none. Amounts are smallest units.
export interface PoolAsset {
  symbol: string;
  token: string;
  decimals: number;
  pool?: string;
  scope?: string;
  minimumDeposit?: string;
  vettingFeeBps?: string;
  maxRelayFeeBps?: string;
  problem?: string;
  dead?: boolean;
}

export default interface PoolInfo {
  network: string;
  chainId: number;
  entrypoint: string;
  extraGas: boolean;
  head: number;
  // blocks per pool event read when rebuilding notes
  logRangeBlocks: number;
  assets: PoolAsset[];
}
