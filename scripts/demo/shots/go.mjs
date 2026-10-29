import unlock from '../lib/unlock.mjs';

// Loads a screen from its address, the way a bookmark opens it. For the encrypted screens,
// `ready` is the selector of the screen once unlocked, and there's extra time to decrypt.
export default async function go(page, base, address, ready) {
  await page.goto(`${base}${address}`);
  await page.locator('.view-head h1, .view-header h1').first().waitFor({ timeout: 30000 }).catch(() => {});
  if (ready) {
    await unlock(page, ready);
    await page.waitForTimeout(2500);
  }
  await page.waitForTimeout(1200);
}
