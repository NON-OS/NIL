import config from '../config.js';
import HttpError from '../lib/HttpError.js';
import ethCall from './ethCall.js';
import abiWord from './abiWord.js';
import selector from './selector.js';

const BALANCE_OF = selector('balanceOf(address)');
const STAKE_INFO = selector('getStakeInfo(address)');

async function read(contract, data, block) {
  if (!contract) return 0n;
  const value = abiWord(await ethCall(contract, data, block), 0);
  if (value === null) throw new HttpError(502, 'Nil couldn’t read a balance from its Ethereum node. Try again in a minute.');
  return value;
}

// What one address holds right now, or at `block` when several reads must see the same moment:
// NOX, NOX staked in the official staking contract and Zero-State Passes. Unlike a vote snapshot,
// a source that doesn't answer is an error, not a zero: a node hiccup must neither take Pro or
// membership away nor hand them out.
export default async function holdingsNow(address, block = 'latest') {
  const arg = address.slice(2).toLowerCase().padStart(64, '0');
  const [nox, staked, zsp] = await Promise.all([
    read(config.nox.token, `0x${BALANCE_OF}${arg}`, block),
    read(config.power.staking, `0x${STAKE_INFO}${arg}`, block),
    read(config.power.zsp, `0x${BALANCE_OF}${arg}`, block),
  ]);
  return { nox, staked, zsp };
}
