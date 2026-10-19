import config from '../config.js';
import holdingsAt from '../chain/holdingsAt.js';
import HttpError from '../lib/HttpError.js';

// What one wallet that belongs to no member held when a public vote opened: NOX in the wallet,
// NOX staked and Zero-State Passes, read at the vote's snapshot block, and the power those add up
// to with the power per pass the vote froze. The block is final, so naming it by number reads the
// same state the members' snapshot did. A node that keeps no state that old answers with an
// error, and the ballot is refused rather than counted as zero.
export default async function outsidePower(address, proposal) {
  let held;
  try {
    held = await holdingsAt(address, `0x${proposal.snapshot_block.toString(16)}`);
  } catch (err) {
    throw new HttpError(502, `This server’s Ethereum node couldn’t read what the wallet held at block ${proposal.snapshot_block}, when the vote opened, so the ballot wasn’t counted. Try again later. (${err.message})`);
  }
  const perZsp = BigInt(proposal.zsp_power ?? 0) * 10n ** BigInt(config.nox.decimals);
  return { ...held, power: held.nox + held.staked + held.zsp * perZsp };
}
