import provenReceipts from './provenReceipts.js';
import sameLog from './sameLog.js';

// blocks one check reads receipts for; a scan that returns more is checked in part
const MAX_BLOCKS = 4;

// Logs as the node gave them, each against its block's receipts as the verifier proves them: a
// log that isn't in its transaction's proven receipt is the node lying. Logs the node left out
// can't be noticed this way; that is the one lie a light client can't catch.
export default async function sameLogs(method, params, answer) {
  if (!Array.isArray(answer.result) || !answer.result.length) return 'unknown';
  const byBlock = new Map();
  for (const log of answer.result) byBlock.set(log.blockHash, [...(byBlock.get(log.blockHash) ?? []), log]);
  let outcome = 'unknown';
  for (const [blockHash, logs] of [...byBlock].slice(0, MAX_BLOCKS)) {
    const block = await provenReceipts(blockHash);
    if (!block.receipts) {
      if (block.outcome === 'differs') return 'differs';
      continue;
    }
    for (const log of logs) {
      const receipt = block.receipts.get(String(log.transactionHash).toLowerCase());
      const proven = receipt?.logs?.find((l) => l.logIndex === log.logIndex);
      if (!sameLog(log, proven)) return 'differs';
    }
    outcome = 'same';
  }
  return outcome;
}
