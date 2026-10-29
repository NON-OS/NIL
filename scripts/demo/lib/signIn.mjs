import saveState from './saveState.mjs';

// Opens the workspace and signs in with the page's wallet if it asks, then keeps the session.
export default async function signIn(page, base, person) {
  await page.goto(base);
  const button = page.getByRole('button', { name: 'Sign in with your wallet' });
  const home = page.locator('.view-head h1');
  await Promise.race([button.waitFor({ timeout: 15000 }), home.waitFor({ timeout: 15000 })]).catch(() => {});
  if (await button.isVisible().catch(() => false)) await button.click();
  await home.waitFor({ timeout: 30000 });
  await saveState(page, person);
}
