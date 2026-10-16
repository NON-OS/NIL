import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import config from '../config.js';
import rpc from './rpc.js';
import nodeReady from './nodeReady.js';

const TOPIC = `0x${bytesToHex(keccak_256(utf8ToBytes('Announcement(uint256,address,address,bytes,bytes)')))}`;
const word = (hex, i) => hex.slice(i * 64, i * 64 + 64);

// One dynamic `bytes` argument out of ABI-encoded log data, refusing offsets that point outside it.
function bytesAt(hex, headIndex) {
  const offset = Number(BigInt(`0x${word(hex, headIndex) || '0'}`)) * 2;
  const length = Number(BigInt(`0x${hex.slice(offset, offset + 64) || '0'}`)) * 2;
  if (offset + 64 + length > hex.length) return null;
  return `0x${hex.slice(offset + 64, offset + 64 + length)}`;
}

// The ERC-5564 announcements a transaction emitted from the configured announcer contract.
// They're what lets a payee find a stealth payout from the chain alone, with no Nil server.
export default async function readAnnouncement(txHash) {
  await nodeReady();
  const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!receipt) return { state: 'unknown' };
  if (receipt.status !== '0x1') return { state: 'failed' };

  const blockNumber = Number(receipt.blockNumber);
  const head = Number(await rpc('eth_blockNumber'));
  const announcements = (receipt.logs ?? [])
    .filter((log) => !log.removed && log.address?.toLowerCase() === config.stealth.announcer && log.topics?.length === 4 && log.topics[0] === TOPIC)
    .map((log) => {
      const data = String(log.data ?? '').replace(/^0x/, '').toLowerCase();
      return {
        schemeId: Number(BigInt(log.topics[1])),
        stealthAddress: `0x${log.topics[2].slice(-40)}`.toLowerCase(),
        ephemeralPublicKey: bytesAt(data, 0),
        metadata: bytesAt(data, 1),
      };
    });
  return { state: 'mined', blockNumber, confirmations: head - blockNumber + 1, announcements };
}
