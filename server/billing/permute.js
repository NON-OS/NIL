import crypto from 'node:crypto';

const ROUNDS = 8;

// A keyed shuffle of the numbers 1 … 10^digits − 1: a balanced Feistel network over the
// smallest power of four that covers them, walked until it lands back in range. It is a
// bijection, so slot shares that don't overlap stay apart after shuffling, while someone
// without the key can't tell from a suffix which share, and so which workspace, it came from.
export default function permute(x, digits, key) {
  const size = 10 ** digits;
  const half = Math.ceil(Math.ceil(Math.log2(size)) / 2);
  const mask = (1 << half) - 1;
  const round = (r, value) => crypto.createHmac('sha256', key).update(`${r}:${value}`).digest().readUInt32BE(0) & mask;

  let v = x;
  do {
    let left = v >>> half;
    let right = v & mask;
    for (let r = 0; r < ROUNDS; r++) [left, right] = [right, left ^ round(r, right)];
    v = (left << half) | right;
  } while (v >= size || v === 0);
  return v;
}
