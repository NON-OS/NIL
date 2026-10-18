import http from '../api/http';
import type PoolEvent from '../types/PoolEvent';

type Receipt = { state: 'unknown' | 'failed' } | { state: 'mined'; blockNumber: number; events: (PoolEvent & { symbol: string })[] };

// Waits for a transaction this browser's wallet sent to the pool, and returns the pool events
// it emitted, or null if it isn't mined within ten minutes.
export default async function poolReceipt(txHash: string, { tries = 150, everyMs = 4000 } = {}): Promise<Receipt | null> {
  for (let i = 0; i < tries; i++) {
    const found = await http.get<Receipt>(`/pools/receipts/${txHash}`).catch(() => null);
    if (found && found.state !== 'unknown') return found;
    await new Promise((r) => setTimeout(r, everyMs));
  }
  return null;
}
