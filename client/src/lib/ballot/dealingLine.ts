import { bytesToHex } from '@noble/hashes/utils';
import { subOrder } from '@zk-kit/baby-jubjub';
import seedKey from '../crypto/seedKey';

// A trustee's secret line f(x) = a0 + a1·x for one vote and seat, derived from their identity
// instead of stored: the browser needs the same line when it commits and again when it reveals,
// possibly after a reload or on another device. Anyone able to recompute it already holds the
// trustee's identity, and learns nothing the trustee couldn't work out when dealing.
export default function dealingLine(seed: Uint8Array, proposalId: string, position: number): [bigint, bigint] {
  const coefficient = (k: number) => BigInt(`0x${bytesToHex(seedKey(seed, `vote dealing ${proposalId} ${position} ${k}`, 64))}`) % subOrder;
  return [coefficient(0), coefficient(1)];
}
