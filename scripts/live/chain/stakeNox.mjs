import calls from './calls.mjs';
import mainnet from './mainnet.mjs';

// Stakes NOX from a test wallet in the official staking contract: approve, then stake, both
// signed by the wallet like a person would from the staking site.
export default async function stakeNox(chain, wallet, amount) {
  const approved = await chain.receipt(await wallet.send({ to: mainnet.nox, data: calls.approve(mainnet.staking, amount) }));
  const staked = await chain.receipt(await wallet.send({ to: mainnet.staking, data: calls.stake(amount) }));
  if (approved.status !== '0x1' || staked.status !== '0x1') throw new Error('Staking NOX reverted.');
  return staked;
}
