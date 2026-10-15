import config from '../config.js';
import rpc from './rpc.js';
import nodeReady from './nodeReady.js';

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const fromTopic = (topic) => `0x${topic.slice(-40)}`.toLowerCase();

// The NOX transfers inside one transaction. Only logs emitted by the token contract itself
// count, so a look-alike token with the same name and symbol can't pass for a payment.
export default async function readTransfer(txHash) {
  await nodeReady();
  const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!receipt) return { state: 'unknown' };
  if (receipt.status !== '0x1') return { state: 'failed' };

  const blockNumber = Number(receipt.blockNumber);
  const head = Number(await rpc('eth_blockNumber'));
  const transfers = (receipt.logs ?? [])
    .filter((log) => !log.removed && log.address?.toLowerCase() === config.nox.token && log.topics?.length === 3 && log.topics[0] === TRANSFER)
    .map((log) => ({ from: fromTopic(log.topics[1]), to: fromTopic(log.topics[2]), value: BigInt(log.data) }));
  return { state: 'mined', blockNumber, confirmations: head - blockNumber + 1, transfers };
}
