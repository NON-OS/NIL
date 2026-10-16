import assert from 'node:assert/strict';
import calls from '../calls.mjs';
import mainnet from '../mainnet.mjs';
import mineWhile from './mineWhile.mjs';
import untilApi from './untilApi.mjs';

// A private payout through the app: the member turns private payouts on, an admin pays to a
// one-time address (once from a plain wallet, one transaction at a time, once from the smart
// wallet as one atomic batch), and the member moves each payout out to their own wallet.
export default async function privatePayout(ctx) {
  const { owner, member, smart } = ctx.people;
  const memberId = (await member.api('GET', '/bootstrap')).me.id;
  await member.page.goto(`${ctx.nil.base}/settings?tab=security`);
  await member.page.getByRole('switch', { name: 'Receive bounties at one-time addresses' }).click();
  await member.page.getByText(/Private payouts on\./).waitFor({ timeout: 60_000 });

  const smartId = (await smart.api('GET', '/bootstrap')).me.id;
  await owner.api('PATCH', `/users/${smartId}`, { role: 'admin' });
  for (const [payer, amount] of [[owner, 15n], [smart, 7n]]) {
    const task = (await owner.api('POST', '/tasks', { title: `Private task ${amount}`, assigneeId: memberId, bounty: String(amount * 10n ** 18n), status: 'done' })).task;
    await payer.page.goto(`${ctx.nil.base}/bounties`);
    await payer.page.getByRole('button', { name: `Pay ${amount} NOX privately to Mia Member`, exact: true }).click();
    await payer.page.getByText(/Sent\. It counts once its block is final|Paid and confirmed on-chain/).waitFor({ timeout: 60_000 });
    await mineWhile(ctx.chain, untilApi(owner, `/tasks/${task.id}/detail`, (r) => r.task.bountyState === 'paid', { what: 'the private payout to be paid' }));
  }

  const balance = async () => BigInt(await ctx.chain.rpc('eth_call', [{ to: mainnet.nox, data: calls.balanceOf(member.wallet.address) }, 'latest']));
  const payouts = await untilApi(member, '/stealth/payouts', (r) => r.payouts.length === 2, { what: 'both payouts to be listed' });
  for (const payout of payouts.payouts) {
    const whole = BigInt(payout.amount) / 10n ** 18n;
    await member.page.goto(`${ctx.nil.base}/bounties`);
    await member.page.getByRole('heading', { name: 'Your private payouts' }).waitFor();
    const row = member.page.locator('.bounty-item', { hasText: payout.taskRef });
    const before = await balance();
    await row.getByRole('button', { name: 'Move' }).click();
    const dialog = member.page.getByRole('dialog');
    await dialog.getByLabel('Destination address').fill(member.wallet.address);
    await dialog.getByRole('button', { name: 'Move funds' }).click();
    await member.page.getByText(/Sent\. The funds arrive once the network includes it\./).waitFor({ timeout: 60_000 });
    await dialog.getByRole('button', { name: 'Done' }).click();
    assert.equal((await balance()) - before, BigInt(payout.amount), `the ${whole} NOX payout reached the member’s wallet`);
  }
}
