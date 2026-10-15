import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import config from '../config.js';
import rpc from './rpc.js';

const selector = (signature) => bytesToHex(keccak_256(utf8ToBytes(signature))).slice(0, 8);
const BALANCE_OF = selector('balanceOf(address)');
const STAKE_INFO = selector('getStakeInfo(address)');
const word = (hex, i = 0) => (typeof hex === 'string' && hex.length >= 2 + (i + 1) * 64 ? BigInt(`0x${hex.slice(2 + i * 64, 2 + (i + 1) * 64)}`) : 0n);

// A contract that reverts (paused, upgraded away, not deployed on this chain) counts as zero
// rather than blocking the vote; the snapshot records what each source said.
async function call(to, data, block) {
  if (!to) return '0x';
  try {
    return await rpc('eth_call', [{ to, data }, block]);
  } catch {
    return '0x';
  }
}

// What one address held at one block: NOX in the wallet, NOX staked in the official staking
// contract (the first word of getStakeInfo is the staked amount), and Zero-State Passes.
export default async function holdingsAt(address, block) {
  const arg = address.slice(2).toLowerCase().padStart(64, '0');
  const [nox, stake, zsp] = await Promise.all([
    call(config.nox.token, `0x${BALANCE_OF}${arg}`, block),
    call(config.power.staking, `0x${STAKE_INFO}${arg}`, block),
    call(config.power.zsp, `0x${BALANCE_OF}${arg}`, block),
  ]);
  return { nox: word(nox), staked: word(stake), zsp: word(zsp) };
}
