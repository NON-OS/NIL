import axe from './axe.mjs';

// From a screen with "Use a wallet on your phone": open the code, hand its link to the headless
// wallet as if scanned, check that the page names the wallet and its address before anything is
// signed, and continue with it. Returns any accessibility problems seen on the way.
export default async function pairPhone(page, phone, watch) {
  const asked = () => phone.seen.filter((s) => s.kind === 'request').length;
  const before = asked();
  await page.getByRole('button', { name: 'Use a wallet on your phone' }).first().click();
  const link = page.locator('#phone-wallet-link');
  await link.waitFor({ timeout: 30_000 });
  await page.getByRole('img', { name: 'Code for your phone wallet to scan' }).waitFor();
  const found = [...(await axe(page, 'phone code'))];
  const uri = await link.inputValue();
  watch.secret(uri);
  await phone.pair(uri);
  const go = page.getByRole('button', { name: 'Continue with this wallet' });
  await go.waitFor({ timeout: 60_000 });
  const shown = await page.locator('.phone-wallet-who .mono').textContent();
  if (shown?.toLowerCase() !== phone.address.toLowerCase()) throw new Error('the page showed a different address than the wallet connected');
  if (!(await page.getByText('Headless Test Wallet').isVisible())) throw new Error('the page didn’t name the wallet before signing');
  if (asked() !== before) throw new Error('the wallet was asked to sign before the person continued');
  found.push(...(await axe(page, 'phone connected')));
  // keyboard: the button to go on has focus
  if (!(await go.evaluate((el) => el === document.activeElement))) throw new Error('Continue with this wallet doesn’t have focus');
  await page.keyboard.press('Enter');
  return found;
}
