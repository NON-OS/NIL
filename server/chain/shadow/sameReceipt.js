import provenReceipts from './provenReceipts.js';
import sameLog from './sameLog.js';

// A receipt as the node gave it, against the receipts of its own block as the verifier proves
// them. A receipt the node says it doesn't have leaves nothing to check (nothing proves absence),
// and one that names a block the verifier can't prove comes back with why. Inside a proven block,
// a transaction that isn't there, or a status or a log that differs, is the node lying.
export default async function sameReceipt(method, params, answer) {
  const told = answer.result;
  if (told === null) return 'skipped';
  if (!told || typeof told !== 'object') return { reason: 'unreadable' };
  const block = await provenReceipts(told.blockHash);
  if (!block.receipts) return block.outcome;
  const proven = block.receipts.get(String(told.transactionHash ?? params[0]).toLowerCase());
  if (!proven || proven.status !== told.status) return 'differs';
  const [a, b] = [told.logs ?? [], proven.logs ?? []];
  return a.length === b.length && a.every((log, i) => sameLog(log, b[i])) ? 'same' : 'differs';
}
