import openPerson from './openPerson.mjs';

// The token-holder door from the sign-in screen: a wallet with enough NOX joins without an invite.
export default async function holderJoin(ctx) {
  await ctx.people.owner.api('PUT', '/holder-gate', { enabled: true, minimum: String(100_000n * 10n ** 18n) });
  const holder = await openPerson(ctx, 'holder', ctx.wallets.holder);
  await holder.page.goto(ctx.nil.base);
  await holder.page.getByRole('button', { name: 'Have NOX tokens? Join without an invite' }).click();
  await holder.page.getByLabel('Your name').fill('Hana Holder');
  await holder.page.getByRole('button', { name: 'Join with your wallet' }).click();
  await holder.page.getByRole('heading', { name: /Good|Working/ }).waitFor();
  ctx.people.holder = holder;
}
