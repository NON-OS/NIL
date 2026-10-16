import { subOrder } from '@zk-kit/baby-jubjub';

// A uniformly random scalar for the Baby Jubjub subgroup: 64 random bytes reduced, so the bias is negligible.
export default function randomScalar() {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return BigInt(`0x${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`) % subOrder;
}
