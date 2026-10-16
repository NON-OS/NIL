// Settings → Agents and the task timeline in a real browser, as the owner: add an agent and see
// its key once, add a webhook and see its secret once, pause, the kill switch, delete, approve
// and decline approval cards, and open a run's log. Screenshots go to --shots.
//
//   node uiCheck.js [--shots <dir>] [--run launchPage]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import openapiClient from './lib/openapiClient.js';
import checks from './lib/checks.js';

const { values: opt } = parseArgs({
  options: {
    state: { type: 'string', default: process.env.LIVE_STATE },
    shots: { type: 'string', default: `${process.env.LIVE_DIR ?? '.'}/screenshots` },
    webhook: { type: 'string', default: 'http://127.0.0.1:4700/nil' },
    // a task whose timeline has a built-in run; skipped when it has none, unless --with-run
    // mentions the built-in agent there first and waits for its run (needs the model)
    run: { type: 'string', default: 'cacheQuestion' },
    'with-run': { type: 'boolean', default: false },
  },
});
const state = JSON.parse(fs.readFileSync(opt.state, 'utf8'));
fs.mkdirSync(opt.shots, { recursive: true });
const t = checks('Browser: Settings → Agents and the timeline');
const specUrl = `${state.url}/api/agent/v1/openapi.json`;
const whoami = async (key) => (await (await openapiClient(specUrl, { key })).call('whoami')).status;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const [name, value] = state.people.owner.cookie.split('=');
await context.addCookies([{ name, value, url: state.url }]);
const page = await context.newPage();
const shot = (file) => page.screenshot({ path: path.join(opt.shots, `${file}.png`), fullPage: true });
const settings = async () => {
  await page.goto(`${state.url}/settings?tab=agents`);
  await page.getByText('Your agents').waitFor();
};
const card = (agentName) => page.getByRole('article', { name: agentName, exact: true });

try {
  await settings();
  await shot('01-agents');
  t.ok((await card('Scout').isVisible()) && (await card('Reader').isVisible()), 'Settings → Agents lists the agents');

  // add an agent: its key is shown once
  await page.getByRole('button', { name: 'Add agent' }).first().click();
  await page.getByPlaceholder('Triage').fill('Writer');
  await page.getByPlaceholder('Sorts new bug reports').fill('Drafts release notes.');
  await page.locator('form').getByRole('button', { name: 'Add agent' }).click();
  const once = page.locator('.key-once');
  await once.waitFor();
  const key = (await once.locator('code').innerText()).trim();
  await shot('02-key-once');
  t.ok(/^nonos_agt_[\w-]{43}$/.test(key), 'the new key is shown once, with a note to copy it now', key.slice(0, 14));
  t.ok((await whoami(key)) === 200, 'the key works on the REST API');
  await settings();
  t.ok(!(await page.content()).includes(key), 'after a reload the key is nowhere on the page');

  // a webhook: its secret is shown once
  await card('Writer').getByRole('tab', { name: 'Webhook' }).click();
  await card('Writer').getByPlaceholder('https://agent.example.com/nil/webhook').fill(opt.webhook);
  await card('Writer').getByRole('button', { name: 'Add webhook' }).click();
  await card('Writer').locator('.key-once').waitFor();
  const secret = (await card('Writer').locator('.key-once code').innerText()).trim();
  await shot('03-secret-once');
  t.ok(/^whsec_/.test(secret), 'the webhook secret is shown once');
  await settings();
  t.ok(!(await page.content()).includes(secret), 'and is gone after a reload');

  // pause and resume
  await card('Writer').getByRole('button', { name: 'Pause' }).click();
  await card('Writer').getByRole('button', { name: 'Resume' }).waitFor();
  await shot('04-paused');
  t.ok((await whoami(key)) === 403, 'Pause: the key is refused at once');
  await card('Writer').getByRole('button', { name: 'Resume' }).click();
  await card('Writer').getByRole('button', { name: 'Pause' }).waitFor();
  t.ok((await whoami(key)) === 200, 'Resume: it works again');

  // the kill switch
  const all = page.getByRole('switch', { name: 'All agents' });
  await all.click();
  await page.getByText('Agents are switched off').waitFor();
  await shot('05-all-off');
  t.ok((await all.getAttribute('aria-checked')) === 'false' && (await whoami(key)) === 503, 'All agents off: the switch says so and every key is refused');
  await all.click();
  await page.getByText('Agents are on').waitFor();
  t.ok((await whoami(key)) === 200, 'back on: keys work again');

  // delete
  await card('Writer').getByRole('button', { name: 'Delete' }).click();
  await card('Writer').getByRole('button', { name: 'Delete for good?' }).click();
  await page.waitForTimeout(800);
  await settings();
  t.ok(!(await card('Writer').count()), 'Delete: the agent is gone from the list');
  t.ok((await whoami(key)) === 401, 'and its key is revoked');

  // approval cards on the timeline
  const scout = await openapiClient(specUrl, { key: state.agents.scout.key });
  const make = async (title) => (await scout.call('create_task', { title, project: 'Website' }, { idempotencyKey: crypto.randomUUID() })).data.created;
  const first = await make('Old banner experiment');
  const second = await make('Retire the beta badge');
  for (const task of [first, second]) await scout.call('delete_task', { key: task.key }, { idempotencyKey: crypto.randomUUID() });
  await page.goto(`${state.url}/?task=${first.key.split('-')[1]}`);
  await page.getByRole('button', { name: 'Approve' }).first().waitFor();
  await shot('06-approval-card');
  await page.getByRole('button', { name: 'Approve' }).first().click();
  await page.waitForTimeout(1200);
  await shot('07-approved');
  t.ok((await scout.call('get_task', { key: first.key })).status === 404, 'Approve on the card ran the delete');
  await page.goto(`${state.url}/?task=${second.key.split('-')[1]}`);
  await page.getByRole('button', { name: 'Decline' }).first().waitFor();
  await page.getByRole('button', { name: 'Decline' }).first().click();
  await page.waitForTimeout(1200);
  await shot('08-declined');
  t.ok((await scout.call('get_task', { key: second.key })).status === 200, 'Decline on the card left the task alone');

  // a run's log from the timeline
  const runTask = state.tasks[opt.run];
  const activity = async () => (await (await fetch(`${state.url}/api/tasks/${runTask.id}/agent-activity`, { headers: { Cookie: state.people.owner.cookie, 'X-NONOS': '1' } })).json()).runs ?? [];
  let runs = runTask ? await activity() : [];
  if (runTask && !runs.length && opt['with-run']) {
    await fetch(`${state.url}/api/tasks/${runTask.id}/comments`, { method: 'POST', headers: { Cookie: state.people.owner.cookie, 'X-NONOS': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ body: '@Helper in two sentences: what should support tell people about this?' }) });
    for (const end = Date.now() + 20 * 60_000; Date.now() < end; await new Promise((r) => setTimeout(r, 3000))) {
      runs = await activity();
      if (runs[0] && !['queued', 'running'].includes(runs[0].status)) break;
    }
  }
  if (!runs.length) t.note('no built-in run to open on this server; run the runner check first to see a run log');
  else {
    await page.goto(`${state.url}/?task=${runTask.number}`);
    const entry = page.locator('.agent-run-head').first();
    await entry.waitFor({ timeout: 15000 });
    t.ok(/for Erik Lind/.test(await entry.innerText()), 'the run says who it worked for', await entry.innerText());
    await entry.click();
    await page.waitForTimeout(800);
    await shot('09-run-log');
    t.ok((await page.getByText('What the agent was given').count()) > 0, 'the run log opens from the timeline and shows each step');
  }
} catch (err) {
  await shot('error');
  t.ok(false, `browser flow stopped: ${err.message.split('\n')[0]}`);
} finally {
  await browser.close();
}
t.done();
