// The phone wallet check: Nil in Chromium with no wallet extension, and a headless "phone" wallet
// in Node that scans nothing but gets the pairing link straight from the page. It creates a
// workspace and signs in through the phone, reloads and unlocks the encryption keys (three
// signatures on the phone), signs out and signs in again, and fails on anything the page asks
// of another host than Nil and the relay. Opt-in and never part of npm test; see "Live phone
// wallet check" in docs/development.md. Needs `npm run build` and a Chromium (CHROMIUM_PATH).
//
//   WALLETCONNECT_PROJECT_ID=<id> node scripts/live/walletconnect/check.mjs   against WalletConnect's relay
//   node scripts/live/walletconnect/check.mjs --local                         against a relay on this machine
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import fakeRelay from '../../../server/test/helpers/fakeRelay.js';
import headlessWallet from './headlessWallet.mjs';
import pageWatch from './pageWatch.mjs';
import steps from './steps.mjs';

const { values: opt } = parseArgs({ options: { local: { type: 'boolean' }, port: { type: 'string', default: process.env.LIVE_PORT ?? '3931' }, relay: { type: 'string' } } });
const world = createRequire(import.meta.url)('../../a11y/world.cjs');
// a placeholder in the right shape, for the relay on this machine, which checks nothing
const LOCAL_PROJECT = '0'.repeat(32);

const projectId = opt.local ? LOCAL_PROJECT : (process.env.WALLETCONNECT_PROJECT_ID ?? '').trim();
if (!projectId) {
  console.log('No WALLETCONNECT_PROJECT_ID in the environment, so the check against WalletConnect’s relay doesn’t run. Use --local for the relay on this machine.');
  process.exit(2);
}
const local = opt.local ? await fakeRelay() : null;
const relayUrl = local?.url ?? opt.relay ?? 'wss://relay.walletconnect.org';
const relayOrigin = new URL(relayUrl).origin;

const app = await world({ port: Number(opt.port), env: { WALLETCONNECT_PROJECT_ID: projectId, WALLETCONNECT_RELAY_URL: relayUrl } });
// the browser reaches the internet through this machine's proxy when there is one, and Nil on
// this machine directly (Playwright would send loopback through the proxy too, without the flag)
const proxy = !local && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
if (proxy) process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK = '1';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, proxy });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
const watch = await pageWatch(context);
const page = await context.newPage();
console.log(`Nil at ${app.base}, relay ${relayOrigin}${local ? ' (on this machine)' : ''}`);

let phone;
let failed = false;
const a11y = [];
try {
  phone = await headlessWallet({ projectId, relayUrl, answerAfterMs: 2500 });
  for (const [name, step] of Object.entries(steps)) {
    const started = Date.now();
    a11y.push(...(await step({ page, phone, app, watch })));
    const problems = watch.problems();
    if (problems.length) throw new Error(`the page reported problems:\n  ${problems.join('\n  ')}`);
    console.log(`ok    ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  }
  const { requests, sockets } = watch.origins();
  const strays = [...requests.filter((o) => o !== app.base), ...sockets.filter((o) => o !== app.base.replace(/^http/, 'ws') && o !== relayOrigin)];
  console.log(`page requests went to ${requests.join(', ')}; WebSockets to ${sockets.join(', ')}`);
  if (strays.length) throw new Error(`the page reached other hosts: ${strays.join(', ')}`);
  if (a11y.length) throw new Error(`accessibility problems:\n  ${a11y.join('\n  ')}`);
  console.log(`the phone wallet saw ${phone.seen.filter((s) => s.kind === 'request').length} requests: ${[...new Set(phone.seen.filter((s) => s.kind === 'request').map((s) => s.method))].join(', ')}`);
} catch (err) {
  failed = true;
  const file = path.join(os.tmpdir(), 'nil-live-walletconnect.png');
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.log(`FAIL  ${err.message ?? err}\n      screenshot: ${file}`);
  if (local) console.log(`      the relay saw ${local.connections.length} connections and ${local.requests.length} requests`);
} finally {
  await phone?.close();
  await browser.close();
  app.stop();
  await local?.close();
}
console.log(failed ? 'the phone wallet check failed' : 'the phone wallet check passed');
process.exit(failed ? 1 : 0);
