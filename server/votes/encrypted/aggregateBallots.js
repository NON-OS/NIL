import { addPoint } from '@zk-kit/baby-jubjub';

const ZERO = [0n, 1n];
const big = (p) => [BigInt(p[0]), BigInt(p[1])];

// Adds every ballot's ciphertexts option by option. Exponential ElGamal adds the hidden powers,
// so the sums encrypt the totals and nothing about any single ballot.
export default function aggregateBallots(ballots, optionCount) {
  const sums = Array.from({ length: optionCount }, () => ({ c1: ZERO, c2: ZERO }));
  for (const b of ballots) {
    for (let k = 0; k < optionCount; k++) {
      sums[k] = { c1: addPoint(sums[k].c1, big(b[k].c1)), c2: addPoint(sums[k].c2, big(b[k].c2)) };
    }
  }
  return sums;
}
