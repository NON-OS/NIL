// Runs axe on every main screen of the built web app, at desktop and phone sizes, against a real
// server with a throwaway workspace and a local test wallet. Fails on any serious or critical
// violation. Needs `npm run build` first; Chromium comes from PLAYWRIGHT_BROWSERS_PATH.
//
//   node scripts/a11y/check.mjs [--shots <dir>] [--only <screen>]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import seed from './seed.mjs';
import screens from './screens.mjs';

const { values: opt } = parseArgs({ options: { shots: { type: 'string' }, only: { type: 'string' }, port: { type: 'string', default: process.env.A11Y_PORT ?? '3989' } } });
const world = createRequire(import.meta.url)('../../marketing/overnight/screen/world.cjs');
const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const FAILING = new Set(['serious', 'critical']);
// built-in AI on, so its buttons are checked too; the address answers nothing, as nothing is asked
const AI = { ANTHROPIC_API_KEY: 'stand-in', ANTHROPIC_MODEL: 'stand-in', ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' };

if (opt.shots) fs.mkdirSync(opt.shots, { recursive: true });
const wanted = (name) => !opt.only || opt.only === name;
const results = [];

async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !document.querySelector('.loading-screen, .view-loading'));
  await page.waitForTimeout(400);
}

// Loads one screen with `reach` and runs axe on it. A screen that doesn't load counts as a
// failure of its own, so a broken screen can't pass by never being checked.
async function check(page, size, name, reach) {
  try {
    await reach();
    const { violations } = await new AxeBuilder({ page }).analyze();
    results.push({ size, name, violations: violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')) })) });
  } catch (err) {
    results.push({ size, name, violations: [{ id: 'did-not-load', impact: 'critical', help: err.message.split('\n')[0], nodes: [] }] });
  }
  if (opt.shots) await page.screenshot({ path: path.join(opt.shots, `${size}-${name}.png`), fullPage: true }).catch(() => {});
}

const app = await world({ port: Number(opt.port), env: AI });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const open = async (size, { cookies = [], key } = {}) => {
  const context = await browser.newContext({ ...SIZES[size], colorScheme: 'light', reducedMotion: 'reduce' });
  await context.addCookies(cookies);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`${size}: page error: ${e.message}`));
  await app.wallet(page, key);
  return page;
};

try {
  for (const size of Object.keys(SIZES)) {
    if (!wanted('setup')) continue;
    const page = await open(size);
    await check(page, size, 'setup', async () => {
      await page.goto(app.base);
      await page.getByLabel('Setup token').waitFor();
    });
    await page.context().close();
  }

  const key = app.newKey();
  const owner = await open('desktop', { key });
  const made = await seed(owner, app);
  const cookies = await owner.context().cookies();
  await owner.context().close();

  for (const size of Object.keys(SIZES)) {
    const visitor = await open(size);
    for (const screen of screens.signedOut.filter((s) => wanted(s.name))) {
      await check(visitor, size, screen.name, async () => {
        await visitor.goto(`${app.base}${screen.path}`);
        await screen.ready(visitor).first().waitFor();
        await settle(visitor);
      });
    }
    await visitor.context().close();
    const page = await open(size, { cookies, key });
    for (const screen of screens.signedIn) {
      if (!wanted(screen.name) || (screen.phoneOnly && size !== 'phone')) continue;
      await check(page, size, screen.name, async () => {
        await page.goto(`${app.base}${typeof screen.path === 'function' ? screen.path(made) : screen.path}`);
        await settle(page);
        if (screen.then) await screen.then(page);
        await settle(page);
      });
    }
    await page.context().close();
  }
} finally {
  await browser.close();
  app.stop();
}

let failing = 0;
for (const r of results) {
  const bad = r.violations.filter((v) => FAILING.has(v.impact));
  failing += bad.length;
  const minor = r.violations.length - bad.length;
  console.log(`${bad.length ? 'FAIL' : 'ok  '}  ${r.size.padEnd(7)} ${r.name.padEnd(18)} ${bad.length} serious or critical, ${minor} minor`);
  for (const v of bad) console.log(`        ${v.impact} ${v.id}: ${v.help}\n          ${v.nodes.slice(0, 4).join('\n          ')}${v.nodes.length > 4 ? `\n          and ${v.nodes.length - 4} more` : ''}`);
}
if (opt.shots) fs.writeFileSync(path.join(opt.shots, 'axe.json'), JSON.stringify(results, null, 1));
console.log(failing ? `${failing} serious or critical violations` : `No serious or critical violations on ${results.length} screens.`);
process.exit(failing ? 1 : 0);
