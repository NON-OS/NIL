import fs from 'node:fs';
import keys from './keys.mjs';
import statePath from './statePath.mjs';
import wallet from './wallet.mjs';

const DESKTOP = { width: 1440, height: 900 };

// A browser page for one of the four people, with their wallet, and their sign-in from an
// earlier script when there is one.
export default async function openPage(browser, person, { viewport = DESKTOP, scale = 1, mobile = false } = {}) {
  const state = statePath(person);
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile, ...(fs.existsSync(state) ? { storageState: state } : {}) });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`  ${person}: page error: ${e.message}`));
  await wallet(page, keys()[person]);
  return page;
}
