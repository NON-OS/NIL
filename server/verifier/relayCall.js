let nextId = 1;

// Passes one request the verifier can't prove (see chain/relayedRead.js) on to the execution
// node, and its answer or error back. Nothing of it is checked; the verdict says so.
export default function relayCall({ executionRpc, timeoutMs }) {
  return async function relay(method, params) {
    try {
      const res = await fetch(executionRpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      const reply = await res.json();
      if (reply?.error) return { error: { code: Number(reply.error.code) || -32000, message: String(reply.error.message ?? 'no reason given').slice(0, 200) } };
      if (reply && 'result' in reply) return { result: reply.result };
    } catch {
      // the same answer as a reply that made no sense
    }
    return { error: { code: -32001, message: 'The execution node didn’t answer.', data: { reason: 'upstream' } } };
  };
}
