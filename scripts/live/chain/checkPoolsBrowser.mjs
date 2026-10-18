// The team pool in a real browser: Nil's own screens in Chromium, with a wallet injected that
// signs with real keys and sends real transactions to a mainnet fork holding 0xbow's real
// Privacy Pools contracts. The admin sets up the pool, deposits, pays a bounty with From pool
// (proved in the page) and takes the rest back; the contributor turns private payouts on and
// moves the payout out. Needs `npm run build` and Playwright (`npm install --prefix marketing/video`).
//
//   ANVIL=/path/to/anvil node scripts/live/chain/checkPoolsBrowser.mjs [--shots dir]
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import openPerson from './browser/openPerson.mjs';
import mineWhile from './browser/mineWhile.mjs';
import untilApi from './browser/untilApi.mjs';
import calls from './calls.mjs';
import SETUP_TOKEN from './setupToken.mjs';
import poolFork from './pools/poolFork.mjs';

const video = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../marketing/video/package.json');
const { chromium } = createRequire(video)('playwright');
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : os.tmpdir();
const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const step = (what) => console.log(`  ${what}`);
const balance = async (rpc, who) => BigInt(await rpc('eth_call', [{ to: USDC, data: calls.balanceOf(who) }, 'latest']));
const shot = (person, name) => person.page.screenshot({ path: path.join(shots, `nil-pools-${name}.png`), fullPage: true });

const fork = await poolFork();
const { anvil, chain, nil } = fork;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = { browser, anvil, nil };
console.log(`Nil at ${nil.base}, fork of mainnet block ${anvil.forkBlock}, server log ${nil.logFile}`);

let failed = false;
const people = [];
try {
  const owner = await openPerson(ctx, 'owner', fork.owner);
  people.push(owner);
  await owner.page.goto(nil.base);
  await owner.page.getByLabel('Setup token').fill(SETUP_TOKEN);
  await owner.page.getByLabel('Workspace name').fill('Pool Check');
  await owner.page.getByLabel('Your name').fill('Olive Owner');
  await owner.page.getByRole('radio', { name: /Crypto team/ }).check();
  await owner.page.getByRole('button', { name: 'Create workspace with your wallet' }).click();
  await owner.page.getByRole('heading', { name: /Good|Working/ }).waitFor();

  const { token } = await owner.api('POST', '/invites', { role: 'member' });
  const member = await openPerson(ctx, 'member', fork.member);
  people.push(member);
  await member.page.goto(`${nil.base}/invite/${token}`);
  await member.page.getByLabel('Your name').fill('Mia Member');
  await member.page.getByRole('button', { name: 'Join with your wallet' }).click();
  await member.page.getByRole('heading', { name: /Good|Working/ }).waitFor();
  await member.page.goto(`${nil.base}/settings?tab=security`);
  await member.page.getByRole('switch', { name: 'Receive bounties at one-time addresses' }).click();
  await member.page.getByText(/Private payouts on\./).waitFor({ timeout: 60_000 });
  step('workspace made in the app; the member turned private payouts on');

  await owner.page.goto(`${nil.base}/bounties`);
  await owner.page.getByRole('button', { name: 'Open the team pool' }).click();
  await owner.page.getByRole('button', { name: 'Set up the team pool' }).click({ timeout: 90_000 });
  await owner.page.getByRole('button', { name: 'Deposit' }).click({ timeout: 60_000 });
  const dialog = owner.page.getByRole('dialog');
  await dialog.getByLabel('Amount').fill('40');
  await dialog.getByText('39.8 USDC').waitFor();
  await shot(owner, 'deposit');
  await dialog.getByRole('button', { name: 'Deposit' }).click();
  await owner.page.getByText(/Deposited\. It can pay bounties once the association set approves it\./).waitFor({ timeout: 120_000 });
  step('deposited 40 USDC from the admin’s wallet in the app; 39.8 landed after the vetting fee');

  // 0xbow would approve it within days; the check approves the newest label on-chain now
  const { events } = await owner.api('POST', '/pools/USDC/events', { fromBlock: anvil.forkBlock + 1, toBlock: await chain.head() });
  const label = events.filter((e) => e.type === 'deposit').at(-1).label;
  await fork.approve(label);
  // Nil keeps the sets it read for PRIVACY_POOLS_SETS_CACHE_SECONDS (5 here)
  await new Promise((r) => setTimeout(r, 6000));
  const memberId = (await member.api('GET', '/bootstrap')).me.id;
  const task = (await owner.api('POST', '/tasks', { title: 'Pool bounty', assigneeId: memberId, bounty: '12000000', bountyToken: 'USDC', status: 'done' })).task;
  await owner.page.goto(`${nil.base}/bounties`);
  await owner.page.getByRole('button', { name: 'Open the team pool' }).click();
  await owner.page.locator('.pay-status').getByText('Approved', { exact: true }).waitFor({ timeout: 60_000 });
  await shot(owner, 'pool');
  step('the pool card shows the deposit as approved');

  await owner.page.locator('.bounty-item', { hasText: 'Pool bounty' }).getByRole('button', { name: 'From pool' }).click();
  const pay = owner.page.getByRole('dialog');
  await pay.getByText('Leaves the pool').waitFor({ timeout: 60_000 });
  await shot(owner, 'pay');
  await pay.getByRole('button', { name: /from the pool$/ }).click();
  await owner.page.getByText(/Sent by the relayer|Handed to the relayer|Paid from the pool/).waitFor({ timeout: 300_000 });
  step('From pool: fee shown, withdrawal proved in the page, relayed');
  const paid = await mineWhile(chain, untilApi(owner, `/tasks/${task.id}/detail`, (r) => r.task.bountyState === 'paid', { what: 'the pool payout to be paid', timeoutMs: 120_000 }));
  assert.equal(paid.task.bountyState, 'paid');

  const payouts = await untilApi(member, '/stealth/payouts', (r) => r.payouts.some((p) => p.status === 'confirmed'), { what: 'the payout to be listed' });
  const payout = payouts.payouts[0];
  assert.equal(await balance(anvil.rpc, payout.address), BigInt(payout.amount));
  // the stand-in relayer sends no extra gas, so the check gives the one-time address a little ETH
  await chain.setBalance(payout.address, 10n ** 15n);
  await member.page.goto(`${nil.base}/bounties`);
  await member.page.locator('.bounty-item', { hasText: payout.taskRef }).getByRole('button', { name: 'Move' }).click();
  const move = member.page.getByRole('dialog');
  await move.getByLabel('Destination address').fill(fork.member.address);
  const before = await balance(anvil.rpc, fork.member.address);
  await move.getByRole('button', { name: 'Move funds' }).click();
  await member.page.getByText(/Sent\. The funds arrive once the network includes it\./).waitFor({ timeout: 60_000 });
  assert.equal((await balance(anvil.rpc, fork.member.address)) - before, BigInt(payout.amount));
  step(`Nil credited it once final; the member moved ${Number(payout.amount) / 1e6} USDC out of the one-time address`);

  await owner.page.goto(`${nil.base}/bounties`);
  await owner.page.getByRole('button', { name: 'Open the team pool' }).click();
  const held = await balance(anvil.rpc, fork.owner.address);
  await owner.page.getByRole('button', { name: 'Take back' }).click({ timeout: 60_000 });
  await owner.page.getByRole('button', { name: 'Take it back publicly?' }).click();
  await owner.page.locator('.pay-status').getByText('Taken back', { exact: true }).waitFor({ timeout: 120_000 });
  assert.ok((await balance(anvil.rpc, fork.owner.address)) > held);
  await shot(owner, 'taken-back');
  step('Take back: the ragequit returned the rest to the admin’s wallet');

  const problems = people.flatMap((p) => p.problems.splice(0));
  assert.deepEqual(problems, []);
} catch (err) {
  failed = true;
  console.log(`FAIL  ${err.stack ?? err}`);
  for (const problem of people.flatMap((p) => p.problems)) console.log(`      ${problem}`);
  for (const p of people) await p.page.screenshot({ path: path.join(shots, `nil-pools-fail-${p.name}.png`), fullPage: true }).catch(() => {});
}
await browser.close();
await fork.stop();
console.log(failed ? 'the pool browser check failed' : 'the pool browser check passed');
process.exit(failed ? 1 : 0);
