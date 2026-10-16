import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import rpcHealth from './rpcHealth.js';

let nextId = 1;

const unreachable = (detail) => new HttpError(502, `Nil couldn’t reach its Ethereum node (${detail}). Try again in a minute.`);

// The node answered but said no: a reverted call, a block it keeps no state for, a transaction
// short of gas. Its own words are passed on. `reverted` marks the contract itself saying no,
// which some callers may read as "nothing there"; nothing else a node refuses is ever mistaken
// for an answer.
function refusal(error, status = null) {
  const message = String(error?.message ?? 'no reason given').slice(0, 160);
  const data = typeof error?.data === 'string' ? error.data : '';
  return Object.assign(new HttpError(502, `The Ethereum node refused${status ? ` (HTTP ${status})` : ''}: ${message}`), { refused: true, reverted: /revert/i.test(`${message} ${data}`) });
}

// One JSON-RPC call to the node in NOX_RPC_URL. No cookies, no redirects, and a hard
// timeout so a slow node can't hold requests open.
export default async function rpc(method, params = [], { timeoutMs = config.nox.rpcTimeoutMs } = {}) {
  let res;
  try {
    res = await fetch(config.nox.rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    rpcHealth.failed();
    throw unreachable('no answer');
  }
  if (!res.ok) {
    // gateways in front of public nodes say why in the body, like "Archive requests require a
    // personal token" for an old block. A 4xx with a reason is the node refusing, not missing.
    const body = await res.json().catch(() => null);
    if (body?.error && res.status < 500 && res.status !== 429) {
      rpcHealth.answered();
      throw refusal(body.error, res.status);
    }
    rpcHealth.failed();
    throw unreachable(`HTTP ${res.status}${body?.error?.message ? `: ${String(body.error.message).slice(0, 120)}` : ''}`);
  }
  const reply = await res.json().catch(() => null);
  if (!reply || typeof reply !== 'object') {
    rpcHealth.failed();
    throw unreachable('unreadable reply');
  }
  rpcHealth.answered();
  if (reply.error) throw refusal(reply.error);
  return reply.result;
}
