import HttpError from '../lib/HttpError.js';

// The node answered but said no: a reverted call, a block it keeps no state for, a transaction
// short of gas. Its own words are passed on. `reverted` marks the contract itself saying no,
// which some callers may read as "nothing there"; nothing else a node refuses is ever mistaken
// for an answer.
export default function rpcRefusal(error, status = null) {
  const message = String(error?.message ?? 'no reason given').slice(0, 160);
  const data = typeof error?.data === 'string' ? error.data : '';
  return Object.assign(new HttpError(502, `The Ethereum node refused${status ? ` (HTTP ${status})` : ''}: ${message}`), { refused: true, reverted: /revert/i.test(`${message} ${data}`) });
}
