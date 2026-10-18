import config from '../config.js';
import finalBlockRef from '../chain/finalBlockRef.js';
import holdingsAt from '../chain/holdingsAt.js';

// What counts toward the holder door for a set of wallets, in NOX's smallest unit: NOX held,
// NOX staked in the official staking contract, and each Zero-State Pass at HOLDER_ZSP_NOX.
// `each` is the same total per wallet, in the order given.
//
// Read the way vote snapshots are: at the newest final block, named by hash (`block`, or found
// here), so a reorg can't count tokens that later vanish. A contract that reverts (paused, or not
// on this chain) counts as zero, while a node that can't be reached, won't serve the block or
// can't be verified is an error, so nobody gains or loses their place over it.
export default async function holderPower(addresses, block = null) {
  const at = block ?? { blockHash: (await finalBlockRef()).hash, requireCanonical: true };
  const perZsp = BigInt(config.holders.zspWorth) * 10n ** BigInt(config.nox.decimals);
  const sum = { nox: 0n, staked: 0n, zsp: 0n };
  const each = [];
  for (const held of await Promise.all(addresses.map((a) => holdingsAt(a, at)))) {
    sum.nox += held.nox;
    sum.staked += held.staked;
    sum.zsp += held.zsp;
    each.push(held.nox + held.staked + held.zsp * perZsp);
  }
  return { ...sum, total: sum.nox + sum.staked + sum.zsp * perZsp, each };
}
