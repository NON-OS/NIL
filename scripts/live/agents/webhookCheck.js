// Webhooks against a real receiver: signed delivery, retries with backoff and fresh signatures,
// timeouts and redirects as failures, redeliver, a rotated secret, pause and the kill switch,
// and the automatic switch-off after failures in a row. Run it against a server started with
// short backoffs (AGENT_WEBHOOK_BACKOFF_SECONDS=1, AGENT_WEBHOOK_MAX_ATTEMPTS=4,
// AGENT_WEBHOOK_DISABLE_AFTER=6, AGENT_POLL_SECONDS=1), with agentService/server.js running.
//
//   node webhookCheck.js [--service http://127.0.0.1:4700]
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import session from './lib/session.js';
import checks from './lib/checks.js';

const { values: opt } = parseArgs({
  options: {
    state: { type: 'string', default: process.env.LIVE_STATE },
    service: { type: 'string', default: 'http://127.0.0.1:4700' },
  },
});
const state = JSON.parse(fs.readFileSync(opt.state, 'utf8'));
const t = checks('Webhooks');
const owner = session(state.url, { cookie: state.people.owner.cookie });
const ana = session(state.url, { cookie: state.people.ana.cookie });
const scout = state.agents.scout;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const control = (body) => fetch(`${opt.service}/control`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
const log = () => fetch(`${opt.service}/log`).then((r) => r.json());
const deliveries = async () => (await owner('GET', `/api/agents/${scout.id}/webhook/deliveries`)).data.deliveries;
const hook = async () => (await owner('GET', '/api/agents')).data.agents.find((a) => a.id === scout.id).webhook;
async function until(what, fn, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${what}`);
}
let n = 0;
const newTaskForScout = async () => (await ana('POST', '/api/tasks', { title: `Webhook check ${++n}`, projectId: state.projects.website, assigneeId: scout.id })).data.task;

await control({ mode: 'ok', work: false, secret: null });

// a delivery, signed
const ping = await owner('POST', `/api/agents/${scout.id}/webhook/test`);
t.ok(ping.data.delivery?.status === 'delivered' && ping.data.delivery.lastStatus === 200, 'Send a test: delivered, receiver answered 200');
const got = (await log()).findLast((e) => e.event === 'ping');
t.ok(got?.valid && got.userAgent?.startsWith('Nil-Webhooks/'), 'the receiver verified the signature as the docs describe', got?.signature);

// failures retry with growing waits, each attempt freshly signed, same delivery id
await control({ mode: 'fail' });
const before = (await log()).length;
const failing = await newTaskForScout();
const failed = await until('the delivery to give up', async () => (await deliveries()).find((d) => d.event === 'task.assigned' && d.payload.data.task.id === failing.id && d.status === 'failed'), 90_000);
t.ok(failed.attempts === 4, `after 4 attempts the delivery is marked failed (${failed.attempts})`, failed.lastError);
const tries = (await log()).slice(before).filter((e) => e.delivery === failed.id);
t.ok(tries.length === 4 && tries.every((e) => e.valid), 'each attempt reached the receiver with a valid signature', `${tries.length} attempts`);
t.ok(new Set(tries.map((e) => e.signature)).size === 4 && new Set(tries.map((e) => e.delivery)).size === 1, 'fresh timestamp and signature each time, one Nil-Delivery id');
const gaps = tries.slice(1).map((e, i) => (Date.parse(e.at) - Date.parse(tries[i].at)) / 1000);
t.ok(gaps.length === 3 && gaps[0] >= 0.4 && gaps[0] <= 3 && gaps[2] >= 1.5 && gaps[2] <= 8, `waits grow between attempts: ${gaps.map((g) => g.toFixed(1)).join(' s, ')} s`);

// redeliver once the receiver is back; a second redelivery is a duplicate to the receiver
await control({ mode: 'ok' });
const again = await owner('POST', `/api/webhook-deliveries/${failed.id}/redeliver`);
t.ok(again.data.delivery?.status === 'delivered', 'Redeliver sends it again and it is delivered');
await owner('POST', `/api/webhook-deliveries/${failed.id}/redeliver`);
const dupes = (await log()).filter((e) => e.delivery === failed.id && e.duplicate);
t.ok(dupes.length >= 1, 'the receiver recognises the repeat by Nil-Delivery and ignores it');

// timeouts and redirects count as failures
await control({ mode: 'slow' });
const slowTask = await newTaskForScout();
const slow = await until('a timed-out attempt', async () => (await deliveries()).find((d) => d.payload.data?.task?.id === slowTask.id && d.attempts >= 1 && d.lastError), 60_000);
t.ok(slow.lastStatus === null && /No answer within 10 seconds/.test(slow.lastError ?? ''), 'a receiver slower than 10 s counts as a failure', slow.lastError);
await control({ mode: 'redirect' });
const movedTask = await newTaskForScout();
const moved = await until('a redirect', async () => (await deliveries()).find((d) => d.payload.data?.task?.id === movedTask.id && d.lastStatus === 302), 60_000);
t.ok(/redirects aren’t followed/.test(moved.lastError ?? ''), 'a redirect counts as a failure and isn’t followed', moved.lastError);

// a rotated secret: the old one stops verifying
await control({ mode: 'ok' });
const rotated = (await owner('POST', `/api/agents/${scout.id}/webhook/secret`)).data.secret;
t.ok(/^whsec_/.test(rotated ?? ''), 'a new signing secret is shown once');
const stale = await owner('POST', `/api/agents/${scout.id}/webhook/test`);
t.ok(stale.data.delivery.status === 'failed' && stale.data.delivery.lastStatus === 401, 'the receiver still on the old secret refuses the delivery', JSON.stringify(stale.data.delivery.lastError));
await control({ secret: rotated });
t.ok((await owner('POST', `/api/agents/${scout.id}/webhook/test`)).data.delivery.status === 'delivered', 'with the new secret it verifies again');

// pause and the kill switch stop deliveries
await owner('POST', `/api/agents/${scout.id}/pause`);
const quiet = (await log()).length;
await newTaskForScout();
await sleep(3000);
t.ok((await log()).length === quiet, 'a paused agent gets no deliveries');
t.ok((await owner('POST', `/api/agents/${scout.id}/webhook/test`)).status === 400, 'not even a test');
await owner('POST', `/api/agents/${scout.id}/resume`);
await owner('PUT', '/api/agent-settings', { enabled: false });
await newTaskForScout();
await sleep(3000);
t.ok((await log()).length === quiet, 'with all agents off nothing goes out');
await owner('PUT', '/api/agent-settings', { enabled: true });

// failures in a row switch the webhook off and tell the admins
await control({ mode: 'fail' });
const startFailures = (await hook()).failures;
for (let i = 0; i < 3; i++) await newTaskForScout();
const off = await until('the switch-off', async () => {
  const h = await hook();
  return h.disabledAt ? h : null;
}, 90_000);
t.ok(off.disabledAt && /failed attempts in a row/.test(off.disabledReason), `the webhook switched itself off (${off.disabledReason})`, `started at ${startFailures} failures`);
const notes = (await owner('GET', '/api/notifications')).data;
t.ok(notes.some((x) => x.type === 'agent_webhook_off'), 'the owner got a notification');
t.ok((await deliveries()).every((d) => d.status !== 'pending'), 'nothing is left queued');
const silent = (await log()).length;
await newTaskForScout();
await sleep(3000);
t.ok((await log()).length === silent, 'a switched-off webhook gets nothing new');
await control({ mode: 'ok' });
await owner('POST', `/api/agents/${scout.id}/webhook/enable`);
const back = await hook();
t.ok(!back.disabledAt && back.failures === 0, 'Turn it back on resets it');
t.ok((await owner('POST', `/api/agents/${scout.id}/webhook/test`)).data.delivery.status === 'delivered', 'and deliveries flow again');
t.done();
