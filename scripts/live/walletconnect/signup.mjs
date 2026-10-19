// The phone wallet check for the hosted sign-up page: the control plane's public site on this
// machine with phone wallets on, Chromium with no wallet extension, and the headless "phone" from
// check.mjs. It opens the code and closes it with Escape, then creates a workspace through the
// phone from "Create with my wallet", and fails on anything the page asks of another host than
// itself and the relay, on accessibility problems in the dialog, and on anything WalletConnect
// leaves in the browser. Opt-in and never part of npm test. Needs `npm ci` and
// `npm run build:phone` in cloud/, and a Chromium (CHROMIUM_PATH).
//
//   WALLETCONNECT_PROJECT_ID=<id> node scripts/live/walletconnect/signup.mjs   against WalletConnect's relay
//   node scripts/live/walletconnect/signup.mjs --local                         against a relay on this machine
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import createSignupFlow from '../../../cloud/signup/createSignupFlow.js';
import createPublicServer from '../../../cloud/signup/http/createPublicServer.js';
import provisionWorkspace from '../../../cloud/provisioning/provisionWorkspace.js';
import testContext from '../../../cloud/test/helpers/testContext.js';
import fakeRelay from '../../../server/test/helpers/fakeRelay.js';
import waitFor from '../chain/waitFor.mjs';
import axe from './axe.mjs';
import headlessWallet from './headlessWallet.mjs';
import pageWatch from './pageWatch.mjs';

const { values: opt } = parseArgs({ options: { local: { type: 'boolean' } } });
const projectId = opt.local ? '0'.repeat(32) : (process.env.WALLETCONNECT_PROJECT_ID ?? '').trim();
if (!projectId) {
  console.log('No WALLETCONNECT_PROJECT_ID in the environment, so the check against WalletConnect’s relay doesn’t run. Use --local for the relay on this machine.');
  process.exit(2);
}
const local = opt.local ? await fakeRelay() : null;
const relayUrl = local?.url ?? 'wss://relay.walletconnect.org';
const relayOrigin = new URL(relayUrl).origin;

// the control plane with a fake runtime, so a sign-up runs to the end without Docker
const ctx = testContext({ env: { WALLETCONNECT_PROJECT_ID: projectId, WALLETCONNECT_RELAY_URL: relayUrl } });
const server = createPublicServer(ctx, createSignupFlow(ctx, { provision: (id) => provisionWorkspace(ctx, id) }));
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const proxy = !local && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
if (proxy) process.env.PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK = '1';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, proxy });
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light', reducedMotion: 'reduce' });
const watch = await pageWatch(context);
const page = await context.newPage();
console.log(`sign-up page at ${base}, relay ${relayOrigin}${local ? ' (on this machine)' : ''}`);

const inDialog = () => page.evaluate(() => Boolean(document.activeElement?.closest('#phone-dialog')));
let phone;
let failed = false;
const a11y = [];
try {
  phone = await headlessWallet({ projectId, relayUrl, answerAfterMs: 2500 });
  await page.goto(base);
  await page.getByLabel('Workspace address').fill('phonecheck');
  await page.getByText('phonecheck.nil.test is available.').waitFor();
  a11y.push(...(await axe(page, 'sign-up page')));

  // open the code, look at it, and close it with Escape
  await page.getByRole('button', { name: 'Use a wallet on your phone' }).click();
  await page.getByRole('img', { name: 'Code for your phone wallet to scan' }).waitFor({ timeout: 30_000 });
  a11y.push(...(await axe(page, 'phone code')));
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press(i % 3 ? 'Tab' : 'Shift+Tab');
    if (!(await inDialog())) throw new Error('keyboard focus left the dialog');
  }
  await page.keyboard.press('Escape');
  await page.locator('#phone-dialog').waitFor({ state: 'hidden' });
  await waitFor(async () => (await page.locator('#phone-link').inputValue()) === '' && (await page.locator('#phone-qr svg').count()) === 0, { timeoutMs: 5000, what: 'the pairing link to leave the page' });
  if (!(await page.getByRole('button', { name: 'Use a wallet on your phone' }).evaluate((el) => el === document.activeElement))) throw new Error('focus didn’t go back to the button that opened the dialog');
  console.log('ok    the code opens, keeps focus inside and closes with Escape');

  // without a wallet in the browser, "Create with my wallet" offers the phone
  await page.getByRole('button', { name: 'Create with my wallet' }).click();
  const link = page.locator('#phone-link');
  await page.getByRole('img', { name: 'Code for your phone wallet to scan' }).waitFor({ timeout: 30_000 });
  const uri = await link.inputValue();
  watch.secret(uri);
  await phone.pair(uri);
  await page.getByText('Your phone connected. Confirm the signature on your phone.').waitFor({ timeout: 60_000 });
  if ((await page.locator('#phone-address').textContent())?.toLowerCase() !== phone.address.toLowerCase()) throw new Error('the dialog showed a different address than the phone connected');
  if (!(await page.getByText('Headless Test Wallet').isVisible())) throw new Error('the dialog didn’t name the wallet');
  a11y.push(...(await axe(page, 'phone connected')));
  await page.getByText('Your workspace is ready').waitFor({ timeout: 120_000 });
  if (!/^[A-Za-z0-9_-]{16,}/.test((await page.locator('#setup-code').textContent()) ?? '')) throw new Error('no setup code on the page');
  const signed = phone.seen.filter((s) => s.kind === 'request');
  if (signed.length !== 1 || signed[0].method !== 'personal_sign' || !/Create the workspace phonecheck\.nil\.test on hosted Nil/.test(signed[0].text ?? '')) throw new Error('the phone wasn’t asked for exactly the one sign-up signature');
  await waitFor(() => phone.ended.length > 0, { what: 'the phone to hear the connection closed' });
  const kept = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, databases: (await indexedDB.databases()).length, cookies: document.cookie }));
  if (kept.local || kept.session || kept.databases || kept.cookies) throw new Error(`the page kept something in the browser: ${JSON.stringify(kept)}`);
  console.log('ok    a workspace was created through the phone, with one signature, and the browser kept nothing');

  const problems = watch.problems();
  if (problems.length) throw new Error(`the page reported problems:\n  ${problems.join('\n  ')}`);
  const { requests, sockets } = watch.origins();
  const strays = [...requests.filter((o) => o !== base), ...sockets.filter((o) => o !== relayOrigin)];
  console.log(`page requests went to ${requests.join(', ')}; WebSockets to ${sockets.join(', ')}`);
  if (strays.length) throw new Error(`the page reached other hosts: ${strays.join(', ')}`);
  if (a11y.length) throw new Error(`accessibility problems:\n  ${a11y.join('\n  ')}`);
} catch (err) {
  failed = true;
  const file = path.join(os.tmpdir(), 'nil-live-signup-phone.png');
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.log(`FAIL  ${err.message ?? err}\n      screenshot: ${file}`);
} finally {
  await phone?.close();
  await browser.close();
  server.close();
  await local?.close();
}
console.log(failed ? 'the sign-up phone wallet check failed' : 'the sign-up phone wallet check passed');
process.exit(failed ? 1 : 0);
