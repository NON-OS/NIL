import relayedRead from '../chain/relayedRead.js';
import provenMethods from './provenMethods.js';
import normalizeResult from './normalizeResult.js';
import heliosFailure from './heliosFailure.js';

const REVERTED = /^(Error: )*execution reverted/;
const NOT_FOUND = /receipt not found/i;

const answer = (id, body) => ({ jsonrpc: '2.0', id, ...body });
const invalid = (id, code, message) => ({ verdict: 'unverified', reply: answer(id, { error: { code, message } }) });
const unproven = (id, reason) => ({ verdict: 'unverified', reply: answer(id, { error: { code: -32001, message: `Nil’s verifier couldn’t prove this answer (${reason}).`, data: { reason } } }) });

// Why the light client can't answer right now, or null when it can.
function notReady(state, maxHeadAgeMs, now) {
  if (state.phase !== 'ready') return state.reason;
  if (now - state.headAt > maxHeadAgeMs) return 'syncing';
  return null;
}

function timeout(work, ms) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('timed out'), { late: true })), ms);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

// One JSON-RPC request in, one reply and its verdict out. "proven" means Helios checked the
// answer against the signed chain, a revert included (it ran the call itself on proven state).
// "absent" is a receipt the execution node says it doesn't have: a light client can't prove that,
// so the app may wait on it but never conclude anything from it. "relayed" is passed on as is.
// Anything that can't be proven comes back as an error with a reason, never as an answer.
export default async function handleRpc(request, { state, relay, config, now = Date.now() }) {
  const id = ['string', 'number'].includes(typeof request?.id) ? request.id : null;
  if (!request || typeof request !== 'object' || Array.isArray(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string') return invalid(id, -32600, 'Send one JSON-RPC 2.0 request at a time.');
  const { method } = request;
  const params = request.params ?? [];
  if (!Array.isArray(params)) return invalid(id, -32602, 'params must be a list.');
  if (relayedRead(method, params)) return { verdict: 'relayed', reply: answer(id, await relay(method, params)) };
  if (!provenMethods.has(method)) return invalid(id, -32601, `Nil’s verifier doesn’t answer ${method.slice(0, 64)}.`);
  // a pending block is whatever the node says it is; nothing about it can be proven
  if (params.includes('pending')) return invalid(id, -32602, 'The pending block can’t be verified.');

  const waiting = notReady(state, config.maxHeadAgeMs, now);
  if (waiting) return unproven(id, waiting);
  if (state.inFlight >= config.maxConcurrent) return unproven(id, 'busy');

  state.inFlight++;
  const work = state.client.request({ method, params });
  work.catch(() => {}).finally(() => state.inFlight--);
  let value;
  try {
    value = normalizeResult(method, await timeout(work, config.timeoutMs));
  } catch (err) {
    const message = String(err?.message ?? err);
    if (REVERTED.test(message)) return { verdict: 'proven', reply: answer(id, { error: { code: 3, message: 'execution reverted' } }) };
    if (method === 'eth_getTransactionReceipt' && NOT_FOUND.test(message)) return { verdict: 'absent', reply: answer(id, { result: null }) };
    return unproven(id, err?.late ? 'timeout' : heliosFailure(err));
  }
  if (value === undefined) return method === 'eth_getTransactionReceipt' ? { verdict: 'absent', reply: answer(id, { result: null }) } : unproven(id, 'out-of-range');
  return { verdict: 'proven', reply: answer(id, { result: value }) };
}
