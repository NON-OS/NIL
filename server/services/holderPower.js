import config from '../config.js';
import nodeReady from '../chain/nodeReady.js';
import holdingsNow from '../chain/holdingsNow.js';

// What counts toward the holder door for a set of wallets, in NOX's smallest unit: NOX held,
// NOX staked in the official staking contract, and each Zero-State Pass at HOLDER_ZSP_NOX.
export default async function holderPower(addresses) {
  await nodeReady();
  const perZsp = BigInt(config.holders.zspWorth) * 10n ** BigInt(config.nox.decimals);
  const sum = { nox: 0n, staked: 0n, zsp: 0n };
  for (const held of await Promise.all(addresses.map((a) => holdingsNow(a)))) {
    sum.nox += held.nox;
    sum.staked += held.staked;
    sum.zsp += held.zsp;
  }
  return { ...sum, total: sum.nox + sum.staked + sum.zsp * perZsp };
}
