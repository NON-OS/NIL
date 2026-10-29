import openDocs from './openDocs.mjs';

// Opens a doc by its title in the list, and gives its text, comments and anyone else editing
// it time to arrive.
export default async function openDoc(page, base, title) {
  await openDocs(page, base);
  await page.locator('button.doc-link', { hasText: title }).first().click({ timeout: 60000 });
  await page.locator('.doc-prose').waitFor();
  await page.waitForTimeout(2500);
}
