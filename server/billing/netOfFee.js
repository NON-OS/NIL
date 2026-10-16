// What arrives when `amount` is sent and the token keeps `bps` basis points of it, rounded the
// way the NOX contract rounds its fee: down.
export default function netOfFee(amount, bps) {
  return BigInt(amount) - (BigInt(amount) * BigInt(bps)) / 10_000n;
}
