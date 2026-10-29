// Docs, chat and files ask for the wallet once per page load before they decrypt anything.
// Clicks through that if it shows, then waits for `ready`, the selector of the unlocked screen.
export default async function unlock(page, ready) {
  const button = page.getByRole('button', { name: 'Unlock with your wallet' });
  const screen = page.locator(ready).first();
  await Promise.race([button.waitFor({ timeout: 30000 }), screen.waitFor({ timeout: 30000 })]).catch(() => {});
  if (await button.isVisible().catch(() => false)) await button.click();
  await screen.waitFor({ timeout: 40000 });
}
