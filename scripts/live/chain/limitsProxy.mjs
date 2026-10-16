import http from 'node:http';

// What https://ethereum-rpc.publicnode.com refused without an API key when measured on
// 16 October 2026: logs whose range starts more than 10,000 blocks under the head, state reads
// more than about 128 blocks under it (both with HTTP 403), and more than 20,000 logs in one
// answer. Blocks and receipts of any age were served, and nothing was rate limited at 18 calls
// a second or 100 at once. Its suggested priority fee was 0, which is passed on here too.
const LIMITS = { logDepth: 10_000, stateDepth: 128, maxLogs: 20_000 };
const STATE_METHODS = { eth_call: 1, eth_getBalance: 1, eth_getCode: 1, eth_getTransactionCount: 1, eth_getStorageAt: 2, eth_estimateGas: 1 };
const ARCHIVE = 'Archive requests require a personal token. Get one at: https://www.allnodes.com/publicnode';

// A JSON-RPC proxy in front of the local node that refuses what the public node refuses, so a
// local run fails where production would. `outage` makes it answer 503 to everything, like an
// unreachable node; `delayMs` slows every answer down.
export default function limitsProxy({ upstream, port = 0, limits = LIMITS } = {}) {
  const state = { outage: false, delayMs: 0, refused: [] };
  const forward = async (body) => (await fetch(upstream, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  // named tags (latest, safe, finalized) are always inside the window
  const blockOf = (tag) => {
    if (typeof tag === 'string' && /^0x[0-9a-f]+$/i.test(tag)) return Number(BigInt(tag));
    return tag === 'earliest' ? 0 : null;
  };

  async function check(call) {
    const head = Number(BigInt((await forward({ jsonrpc: '2.0', id: 0, method: 'eth_blockNumber', params: [] })).result));
    if (call.method === 'eth_getLogs') {
      const from = blockOf(call.params?.[0]?.fromBlock);
      if (from !== null && from < head - limits.logDepth) return { status: 403, error: { code: -32602, message: ARCHIVE } };
    }
    const at = STATE_METHODS[call.method];
    if (at !== undefined) {
      const block = blockOf(call.params?.[at]);
      if (block !== null && block < head - limits.stateDepth) return { status: 403, error: { code: -32602, message: ARCHIVE } };
    }
    return null;
  }

  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const reply = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    try {
      if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
      if (state.outage) return reply(503, { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Service unavailable' } });
      const call = JSON.parse(raw);
      if (Array.isArray(call)) return reply(200, await forward(call));
      if (call.method === 'eth_maxPriorityFeePerGas') return reply(200, { jsonrpc: '2.0', id: call.id, result: '0x0' });
      const refused = await check(call);
      if (refused) {
        state.refused.push({ method: call.method, params: call.params });
        return reply(refused.status, { jsonrpc: '2.0', id: call.id, error: refused.error });
      }
      const answer = await forward(call);
      if (call.method === 'eth_getLogs' && Array.isArray(answer.result) && answer.result.length > limits.maxLogs) {
        return reply(200, { jsonrpc: '2.0', id: call.id, error: { code: -32602, message: `query exceeds max results ${limits.maxLogs}` } });
      }
      return reply(200, answer);
    } catch (err) {
      return reply(502, { jsonrpc: '2.0', id: null, error: { code: -32603, message: String(err.message) } });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}`, state, close: () => new Promise((r) => server.close(r)) });
    });
  });
}
