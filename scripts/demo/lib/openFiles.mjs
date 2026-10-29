import unlock from './unlock.mjs';

// Loads Files fresh at its top level and unlocks it.
export default async function openFiles(page, base) {
  await page.goto(`${base}/files`);
  await unlock(page, '.files-page');
  await page.waitForTimeout(1500);
}
