// A pool event as the server reads it from the chain, every team's alike.
export default interface PoolEvent {
  type: 'deposit' | 'withdrawal' | 'ragequit';
  depositor?: string;
  processooor?: string;
  ragequitter?: string;
  commitment?: string;
  label?: string;
  value: string;
  precommitment?: string;
  nullifierHash?: string;
  newCommitment?: string;
  blockNumber: number;
  txHash: string;
}
