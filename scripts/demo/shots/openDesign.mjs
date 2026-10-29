import go from './go.mjs';

// Opens the shared Design folder, then a folder or file in it when one is named, with time for
// the thumbnails to decrypt.
export default async function openDesign(page, base, inside) {
  await go(page, base, '/files', '.files-page');
  await page.locator('.files-folder-card', { hasText: 'Design' }).first().locator('a, .files-open').first().click();
  await page.waitForTimeout(inside ? 1500 : 3500);
  if (!inside) return;
  await page.locator('.files-tile', { hasText: inside }).first().locator('.files-open').click();
  await page.waitForTimeout(3500);
}
