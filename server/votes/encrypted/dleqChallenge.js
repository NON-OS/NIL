import crypto from 'node:crypto';
import { subOrder } from '@zk-kit/baby-jubjub';

// The Fiat–Shamir challenge of a Chaum–Pedersen proof, bound to every point in the statement.
// Browsers compute the identical hash when they prove.
export default function dleqChallenge(points) {
  const text = `nonos/dleq/v1|${points.map((p) => `${p[0]},${p[1]}`).join('|')}`;
  return BigInt(`0x${crypto.createHash('sha256').update(text).digest('hex')}`) % subOrder;
}
