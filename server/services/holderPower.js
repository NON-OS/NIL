import config from '../config.js';
import nodeReady from '../chain/nodeReady.js';
import holdingsAt from '../chain/holdingsAt.js';

// What counts toward the holder door for a set of wallets, in NOX's smallest unit: NOX held,
// NOX staked in the official staking contract, and each Zero-State Pass at HOLDER_ZSP_NOX.
// `each` is the same total per wallet, in the order given. Read at `block`, the latest by default.
// Read the way vote snapshots are: a contract that reverts (paused, or not on this chain) counts
// as zero, while a node that can't be reached or refuses the read is an error, so nobody gains
// or loses their place over a node that didn't answer.
export default async function holderPower(addresses, block = 'latest') {
  await nodeReady();
  const perZsp = BigInt(config.holders.zspWorth) * 10n ** BigInt(config.nox.decimals);
  const sum = { nox: 0n, staked: 0n, zsp: 0n };
  const each = [];
  for (const held of await Promise.all(addresses.map((a) => holdingsAt(a, block)))) {
    sum.nox += held.nox;
    sum.staked += held.staked;
    sum.zsp += held.zsp;
    each.push(held.nox + held.staked + held.zsp * perZsp);
  }
  return { ...sum, total: sum.nox + sum.staked + sum.zsp * perZsp, each };
}
