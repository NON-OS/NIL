import config from '../config.js';
import rpc from './rpc.js';
import selector from './selector.js';
import abiWord from './abiWord.js';

const FEES = `0x${selector('fees()')}`;

// NOX's fee on transfers between ordinary wallets at a block, in basis points: the third value of
// the token's fees() (buy, sell, transfer, then how the fee is shared out). A token without
// fees() has none and answers 0. A node that can't answer is an error, never "no fee".
export default async function noxTransferFee(block = 'latest') {
  let answer;
  try {
    answer = await rpc('eth_call', [{ to: config.nox.token, data: FEES }, block]);
  } catch (err) {
    if (err.reverted) return 0;
    throw err;
  }
  const bps = abiWord(answer, 2);
  return bps === null ? 0 : Number(bps < 10_000n ? bps : 10_000n);
}
