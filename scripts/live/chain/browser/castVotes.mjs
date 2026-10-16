import assert from 'node:assert/strict';

// Votes in the app: a vote weighted by on-chain power, signed by a plain wallet and by the smart
// wallet, and an anonymous vote where the member proves a ballot in the browser.
export default async function castVotes(ctx) {
  const { owner, smart, member } = ctx.people;
  const { proposal } = await owner.api('POST', '/proposals', { title: 'Fund the audit', options: ['Fund', 'Wait'], weighting: 'power' });
  for (const [person, option] of [[owner, 'Fund'], [smart, 'Wait']]) {
    await person.page.goto(`${ctx.nil.base}/votes`);
    const card = person.page.locator('article', { hasText: 'Fund the audit' });
    await card.getByRole('group', { name: 'Your vote' }).getByRole('button', { name: option, exact: true }).click();
    await person.page.getByText('Vote signed and counted.').waitFor();
  }
  const seen = (await owner.api('GET', '/proposals')).find((p) => p.id === proposal.id);
  assert.equal(seen.voters, 2);

  await owner.api('POST', '/proposals', { title: 'Keep Friday demos?', anonymous: true });
  await member.page.goto(`${ctx.nil.base}/votes`);
  const join = member.page.getByRole('button', { name: 'Join anonymous votes' });
  if (await join.isVisible().catch(() => false)) {
    await join.click();
    await member.page.getByText(/You joined anonymous votes/).waitFor({ timeout: 60_000 });
  }
  await member.page.getByRole('group', { name: 'Your anonymous vote' }).getByRole('button', { name: 'Yes', exact: true }).click();
  await member.page.getByText(/Ballot proven\. It joins the count/).waitFor({ timeout: 120_000 });
}
