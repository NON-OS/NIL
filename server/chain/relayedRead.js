// Requests Nil's verifier passes on unproven, because a light client can't prove them and nothing
// Nil decides rests on the answer: sending a signed transaction, gas estimates, fee suggestions,
// and the pending nonce a new transaction needs. A wrong answer there makes a transaction fail
// or cost more gas; it never credits a payment, counts a vote or lets anyone in.
const RELAYED = new Set(['eth_sendRawTransaction', 'eth_estimateGas', 'eth_maxPriorityFeePerGas', 'eth_gasPrice']);

export default function relayedRead(method, params) {
  return RELAYED.has(method) || (method === 'eth_getTransactionCount' && Array.isArray(params) && params[1] === 'pending');
}
