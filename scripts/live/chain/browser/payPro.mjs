import mineWhile from './mineWhile.mjs';

// Nil Pro from Settings → Plan: an invoice for 30 days, paid in USDC from the browser wallet, and
// counted once its block is final.
export default async function payPro(ctx) {
  const { page } = ctx.people.owner;
  await page.goto(`${ctx.nil.base}/settings?tab=plan`);
  await page.getByRole('radio', { name: '30 days' }).click();
  await page.getByRole('button', { name: 'Make the invoice' }).click();
  await page.getByRole('radiogroup', { name: 'Pay in' }).getByRole('radio', { name: /USDC/ }).click();
  await page.getByRole('button', { name: /Pay USDC from this browser’s wallet/ }).click();
  await page.getByText(/Payment found|Your transaction was sent/).first().waitFor();
  await mineWhile(ctx.chain, page.getByText('Paid', { exact: true }).waitFor({ timeout: 90_000 }));
}
