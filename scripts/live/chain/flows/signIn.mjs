import assert from 'node:assert/strict';
import coinbaseWallet from '../coinbaseWallet.mjs';
import fundWallet from '../fundWallet.mjs';

// Wallet sign-in with a plain key, and with a Coinbase Smart Wallet both before it exists
// on-chain (EIP-6492) and after it's deployed (EIP-1271). Leaves the owner, a member and the
// smart-wallet member signed in for the flows after it.
export default async function signIn(ctx) {
  const { wallets, chain } = ctx;
  const owner = ctx.client();
  const setup = await owner.wallet(wallets.owner, 'setup', { name: 'Olive Owner', workspaceName: 'Live Check' });
  ctx.people.owner = { api: owner, id: setup.user.id, wallet: wallets.owner };

  const join = async (w, name) => {
    const { token } = await owner.post('/invites', { role: 'member' });
    const api = ctx.client();
    const joined = await api.wallet(w, 'invite', { name, inviteToken: token });
    return { api, id: joined.user.id, wallet: w };
  };
  ctx.people.member = await join(wallets.member, 'Mia Member');
  ctx.people.staker = await join(wallets.staker, 'Stan Staker');
  ctx.people.payer = await join(wallets.payer, 'Pat Payer');

  // a fresh account each run, so the counterfactual case is always there
  const smart = await coinbaseWallet(chain.rpc, wallets.smartOwner, { nonce: BigInt(Date.now()) });
  assert.equal(await smart.deployed(), false);
  ctx.people.smart = await join(smart, 'Sam Smart');
  const again = ctx.client();
  await again.wallet(smart, 'login');

  // someone else's signature in the smart wallet's name is refused
  const challenge = await again.post('/auth/wallet/challenge', { address: smart.address, mode: 'login', chainId: ctx.chainId });
  const forged = await wallets.member.signMessage(challenge.message);
  await again.post('/auth/wallet/verify', { challengeId: challenge.challengeId, signature: forged }, { expect: 401 });

  await chain.receipt(await smart.deploy());
  await fundWallet(chain, smart.address, { eth: 10n ** 17n, nox: 20_000n * 10n ** 18n });
  assert.equal(await smart.deployed(), true);
  const deployed = ctx.client();
  await deployed.wallet(smart, 'login');
  ctx.people.smart.api = deployed;
}
