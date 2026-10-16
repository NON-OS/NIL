let nextId = 0;
// what anvil says when a free public node behind the fork didn't answer; worth another try
const UPSTREAM = /error sending request|connection|timed out|HTTP error 5\d\d|Transport/i;

// JSON-RPC to one node. Errors keep the node's code and message, and a check stops at the first
// surprise instead of carrying on with a half-made setup. Only a fork's upstream hiccup is retried.
export default function rpcClient(url) {
  return async function rpc(method, params = [], attempt = 1) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++nextId, method, params }),
    });
    const reply = await res.json().catch(() => null);
    if (!reply) throw new Error(`${method}: HTTP ${res.status} with no JSON body`);
    if (reply.error && UPSTREAM.test(reply.error.message) && attempt < 6) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      return rpc(method, params, attempt + 1);
    }
    if (reply.error) throw Object.assign(new Error(`${method}: ${reply.error.message}`), { code: reply.error.code, data: reply.error.data, status: res.status });
    return reply.result;
  };
}
