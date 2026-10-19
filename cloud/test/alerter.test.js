import test from 'node:test';
import assert from 'node:assert/strict';
import createAlerter from '../ops/createAlerter.js';
import readTelegram from '../config/readTelegram.js';
import envReader from '../config/envReader.js';

const TOKEN = `123456789:${'A'.repeat(35)}`;
const quietLog = () => {
  const lines = [];
  const add = (level) => (event, fields) => lines.push({ level, event, fields });
  return { lines, warn: add('warn'), error: add('error'), info: add('info') };
};
const fakeFetch = (status = 200) => {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return { ok: status < 300, status };
  };
  return { calls, impl };
};
const config = (alerts) => ({ domain: 'nil.example', alerts: { repeatMin: 30, webhook: null, token: null, telegram: null, ...alerts } });

test('an alert goes to the Telegram chat the bot is set for', async () => {
  const { calls, impl } = fakeFetch();
  const alert = createAlerter({ config: config({ telegram: { token: TOKEN, chat: '-1001234567890' } }), log: quietLog(), fetchImpl: impl });
  assert.equal(await alert('backup.failed', { workspace: { id: 'w1', name: 'acme' }, message: 'Disk full.', severity: 'critical' }), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `https://api.telegram.org/bot${TOKEN}/sendMessage`);
  assert.deepEqual(calls[0].body, { chat_id: '-1001234567890', text: '[nil.example] critical: backup.failed (acme). Disk full.', disable_web_page_preview: true });
});

test('the webhook and Telegram both get the alert when both are set', async () => {
  const { calls, impl } = fakeFetch();
  const alert = createAlerter({ config: config({ webhook: 'https://hooks.example/x', telegram: { token: TOKEN, chat: '@nil_ops_alerts' } }), log: quietLog(), fetchImpl: impl });
  assert.equal(await alert('test', { repeatMin: 0 }), true);
  assert.deepEqual(calls.map((c) => c.url).sort(), [`https://api.telegram.org/bot${TOKEN}/sendMessage`, 'https://hooks.example/x']);
});

test('a refused Telegram post is logged by status only, never with the token', async () => {
  const log = quietLog();
  const alert = createAlerter({ config: config({ telegram: { token: TOKEN, chat: '-1001234567890' } }), log, fetchImpl: fakeFetch(401).impl });
  assert.equal(await alert('test', { repeatMin: 0 }), false);
  const failed = log.lines.find((l) => l.event === 'alert.telegram_failed');
  assert.deepEqual(failed.fields, { status: 401 });
  assert.ok(!JSON.stringify(log.lines).includes(TOKEN));
});

test('a network error is logged without the request URL', async () => {
  const log = quietLog();
  const boom = async (url) => { throw Object.assign(new TypeError(`fetch failed for ${url}`), { cause: { code: 'ENOTFOUND' } }); };
  const alert = createAlerter({ config: config({ telegram: { token: TOKEN, chat: '-1001234567890' } }), log, fetchImpl: boom });
  assert.equal(await alert('test', { repeatMin: 0 }), false);
  assert.deepEqual(log.lines.find((l) => l.event === 'alert.telegram_failed').fields, { error: 'ENOTFOUND' });
  assert.ok(!JSON.stringify(log.lines).includes(TOKEN));
});

test('the same alert for the same workspace is sent once per repeat window', async () => {
  const { calls, impl } = fakeFetch();
  let clock = 0;
  const alert = createAlerter({ config: config({ telegram: { token: TOKEN, chat: '-1001234567890' } }), log: quietLog(), fetchImpl: impl, now: () => clock });
  await alert('restart', { workspace: { id: 'w1', name: 'acme' } });
  await alert('restart', { workspace: { id: 'w1', name: 'acme' } });
  clock += 31 * 60_000;
  await alert('restart', { workspace: { id: 'w1', name: 'acme' } });
  assert.equal(calls.length, 2);
});

test('Telegram settings need both values, a real-looking token and a chat id', () => {
  const read = (env) => {
    const reader = envReader(env);
    return { telegram: readTelegram(reader), warnings: reader.warnings };
  };
  assert.deepEqual(read({ CLOUD_ALERT_TELEGRAM_TOKEN: TOKEN, CLOUD_ALERT_TELEGRAM_CHAT: '-1001234567890' }).telegram, { token: TOKEN, chat: '-1001234567890' });
  assert.equal(read({}).telegram, null);
  const half = read({ CLOUD_ALERT_TELEGRAM_TOKEN: TOKEN });
  assert.equal(half.telegram, null);
  assert.equal(half.warnings.length, 1);
  const bad = read({ CLOUD_ALERT_TELEGRAM_TOKEN: 'nope-secret-value', CLOUD_ALERT_TELEGRAM_CHAT: '-1001234567890' });
  assert.equal(bad.telegram, null);
  assert.ok(!bad.warnings.join(' ').includes('nope-secret-value'));
  assert.equal(read({ CLOUD_ALERT_TELEGRAM_TOKEN: TOKEN, CLOUD_ALERT_TELEGRAM_CHAT: 'general' }).telegram, null);
});
