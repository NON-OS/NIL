import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import openDocs from '../lib/openDocs.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/docs');

// The app names an imported doc after the heading the file opens with.
const titleOf = (file) => fs.readFileSync(file, 'utf8').match(/^#\s+(.+)$/m)[1].trim();

async function importOne(page, file, title) {
  const before = new URL(page.url()).pathname;
  await page.getByRole('button', { name: 'New doc from a template' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: 'From a Word or Markdown file' }).click();
  await (await chooser).setFiles(file);
  await page.waitForURL((url) => url.pathname !== before, { timeout: 20000 });
  await page.locator('.doc-prose').waitFor({ timeout: 20000 });
  await page.locator('button.doc-link', { hasText: title }).first().waitFor({ timeout: 20000 });
  // it saves as it goes; let it finish before the next import replaces the editor
  await page.waitForTimeout(2500);
}

// Ada brings in the six Markdown docs from the New doc menu, as anyone would. A doc whose title
// is in the list already is left alone, so a rerun adds nothing.
export default async function importDocs(page, base) {
  await openDocs(page, base);
  const have = await page.locator('button.doc-link strong').allInnerTexts();
  for (const name of fs.readdirSync(FIXTURES).sort()) {
    const file = path.join(FIXTURES, name);
    const title = titleOf(file);
    if (!have.includes(title)) await importOne(page, file, title);
  }
}
