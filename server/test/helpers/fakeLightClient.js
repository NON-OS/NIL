// Stands in for Helios in tests: it answers from an Ethereum node (helpers/mockChain.js), in the
// shapes Helios uses (a balance as a decimal string, a missing receipt as an error), and refuses
// any answer the test marks as a lie the way Helios refuses one that doesn't match the signed
// chain. What Helios itself catches is shown against mainnet by scripts/verifier/mainnet-check.mjs;
// these tests are about what Nil does with a verdict.
export default function fakeLightClient(nodeUrl) {
  let id = 1;
  const client = {
    // (method, params, result) => true for an answer the signed chain would contradict
    lies: () => false,
    // (method, params) => an Error to throw instead of asking the node at all
    fails: () => null,
    requests: [],
    closed: false,

    async request({ method, params }) {
      client.requests.push({ method, params });
      const failure = client.fails(method, params);
      if (failure) throw failure;
      if (method === 'helios_getCurrentCheckpoint') return `0x${'ab'.repeat(32)}`;
      if (method === 'eth_chainId') return '0x1';
      const res = await fetch(nodeUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) });
      const reply = await res.json();
      if (reply.error) throw new Error(/revert/i.test(reply.error.message) ? 'execution reverted: ' : `server returned an error response: ${reply.error.message}`);
      if (client.lies(method, params, reply.result)) throw new Error(method === 'eth_call' || method === 'eth_getBalance' ? 'evm error: "invalid account proof for address"' : 'receipt root mismatch for tx');
      if (method === 'eth_getTransactionReceipt' && reply.result === null) throw new Error('receipt not found');
      if (method === 'eth_getBalance') return BigInt(reply.result).toString();
      if (method === 'eth_getTransactionCount') return Number(BigInt(reply.result));
      return reply.result;
    },

    async shutdown() {
      client.closed = true;
    },
  };
  return client;
}
