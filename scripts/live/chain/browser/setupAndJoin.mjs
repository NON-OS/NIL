import openPerson from './openPerson.mjs';
import coinbaseWallet from '../coinbaseWallet.mjs';
import fundWallet from '../fundWallet.mjs';
import SETUP_TOKEN from '../setupToken.mjs';

const home = (p) => p.page.getByRole('heading', { name: /Good|Working/ }).waitFor();

// Wallet sign-in in the real app: the owner creates the workspace with a plain wallet, a member
// joins from an invite link, and a Coinbase Smart Wallet joins before it exists on-chain
// (EIP-6492), then signs in again from a new browser once it's deployed (EIP-1271).
export default async function setupAndJoin(ctx) {
  const { wallets, chain } = ctx;
  const owner = await openPerson(ctx, 'owner', wallets.owner);
  await owner.page.goto(ctx.nil.base);
  await owner.page.getByLabel('Setup token').fill(SETUP_TOKEN);
  await owner.page.getByLabel('Workspace name').fill('Live Check');
  await owner.page.getByLabel('Your name').fill('Olive Owner');
  await owner.page.getByRole('radio', { name: /Crypto team/ }).check();
  await owner.page.getByRole('button', { name: 'Create workspace with your wallet' }).click();
  await home(owner);
  ctx.people.owner = owner;

  const join = async (key, name, wallet) => {
    const { token } = await owner.api('POST', '/invites', { role: 'member' });
    const person = await openPerson(ctx, key, wallet);
    await person.page.goto(`${ctx.nil.base}/invite/${token}`);
    await person.page.getByLabel('Your name').fill(name);
    await person.page.getByRole('button', { name: 'Join with your wallet' }).click();
    await home(person);
    return person;
  };
  ctx.people.member = await join('member', 'Mia Member', wallets.member);
  ctx.people.staker = await join('staker', 'Stan Staker', wallets.staker);

  const smart = await coinbaseWallet(chain.rpc, wallets.smartOwner, { nonce: BigInt(Date.now()) });
  const first = await join('smart', 'Sam Smart', smart);
  await first.context.close();
  await chain.receipt(await smart.deploy());
  await fundWallet(chain, smart.address, { eth: 10n ** 17n, nox: 20_000n * 10n ** 18n });
  const again = await openPerson(ctx, 'smart', smart);
  await again.page.goto(ctx.nil.base);
  await again.page.getByRole('button', { name: 'Sign in with your wallet' }).click();
  await home(again);
  ctx.people.smart = again;
}
