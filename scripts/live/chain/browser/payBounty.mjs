import mineWhile from './mineWhile.mjs';
import untilApi from './untilApi.mjs';

// A bounty paid from the Bounties page: the wallet sends the exact amount Nil asks for, and the
// bounty turns paid once the block is final.
export default async function payBounty(ctx) {
  const { owner, member } = ctx.people;
  const memberId = (await member.api('GET', '/bootstrap')).me.id;
  const task = (await owner.api('POST', '/tasks', { title: 'Write the launch checklist', assigneeId: memberId, bounty: String(25n * 10n ** 18n), status: 'done' })).task;
  await owner.page.goto(`${ctx.nil.base}/bounties`);
  await owner.page.getByRole('button', { name: 'Pay 25 NOX to Mia Member', exact: true }).click();
  await owner.page.getByText(/Sent\. It counts once its block is final|Paid and confirmed on-chain/).waitFor();
  await mineWhile(ctx.chain, untilApi(owner, `/tasks/${task.id}/detail`, (r) => r.task.bountyState === 'paid', { what: 'the bounty to be paid' }));
}
