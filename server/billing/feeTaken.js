// Whether the token really kept `fee` from `from` in this transaction: one other Transfer of the
// same token from the same sender carries exactly that much, or all of them together do (a fee
// split between several holders). Without that, a transfer short by the fee is simply short.
export default function feeTaken(transfers, { token, from, fee, except }) {
  const others = transfers.filter((t) => t.token === token && t.from === from && t.logIndex !== except);
  return others.some((t) => t.value === fee) || (others.length > 1 && others.reduce((sum, t) => sum + t.value, 0n) === fee);
}
