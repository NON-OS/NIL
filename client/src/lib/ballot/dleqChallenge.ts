import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { subOrder } from '@zk-kit/baby-jubjub';

// Must match the server's challenge byte for byte, or honest proofs would be refused.
export default function dleqChallenge(points: [bigint, bigint][]) {
  const text = `nonos/dleq/v1|${points.map((p) => `${p[0]},${p[1]}`).join('|')}`;
  return BigInt(`0x${bytesToHex(sha256(utf8ToBytes(text)))}`) % subOrder;
}
