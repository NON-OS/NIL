import { addPoint, mulPointEscalar } from '@zk-kit/baby-jubjub';

const ZERO = [0n, 1n];

// The public half of trustee j's key share, computable by anyone from the published dealings:
// X_j = Σ_i (A_i0 + j·A_i1). A partial decryption is checked against it.
export default function trusteeKey(dealings, position) {
  let key = ZERO;
  for (const [a0, a1] of dealings) key = addPoint(key, addPoint(a0, mulPointEscalar(a1, BigInt(position))));
  return key;
}
