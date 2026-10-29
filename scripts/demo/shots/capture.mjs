import fs from 'node:fs';
import path from 'node:path';
import openDoc from '../lib/openDoc.mjs';
import openPage from '../lib/openPage.mjs';
import step from '../lib/step.mjs';
import desktop from './desktop.mjs';
import phone from './phone.mjs';

const SIZES = [
  ['desktop', desktop, { viewport: { width: 1440, height: 900 }, scale: 2 }],
  ['phone', phone, { viewport: { width: 390, height: 844 }, scale: 3, mobile: true }],
];

// Ben, with the launch plan open and his cursor in it, so Ada sees someone else there.
async function benInTheDoc(browser, base) {
  const ben = await openPage(browser, 'ben');
  await openDoc(ben, base, 'Atlas 2.0 launch plan').catch(() => {});
  await ben.locator('.doc-prose p').nth(1).click().catch(() => {});
  return ben;
}

async function shoot(page, base, reach, file) {
  try {
    await reach(page, base);
    await page.screenshot({ path: file });
    return true;
  } catch (err) {
    console.log(`  ${path.basename(file)} failed: ${err.message.split('\n')[0]}`);
    return false;
  } finally {
    await page.keyboard.press('Escape').catch(() => {});
  }
}

// Screenshots of every main screen as Ada, at 2x on a desktop and 3x on a phone, into `out`.
// `only` takes one, by its name or with its size: board, or phone-board. Returns how many failed.
export default async function capture(browser, base, { out, only }) {
  fs.mkdirSync(out, { recursive: true });
  const ben = await benInTheDoc(browser, base);
  let failed = 0;
  for (const [size, list, options] of SIZES) {
    const page = await openPage(browser, 'ada', options);
    for (const [name, reach] of list) {
      const id = `${size}-${name}`;
      if (only && only !== name && only !== id) continue;
      if (await shoot(page, base, reach, path.join(out, `${id}.png`))) step(id);
      else failed++;
    }
    await page.context().close();
  }
  await ben.context().close();
  return failed;
}
