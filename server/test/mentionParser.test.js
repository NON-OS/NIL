import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// The @mention parser reads every comment. A long run of dots or dashes after an @ used to make
// it backtrack over the run once per character, so a 10,000-character comment took over ten
// times as long as a normal one and a few dozen of them held up the whole server.
let srv;
const base = () => srv.base;
const owner = client(base);
const jane = client(base);
const ids = {};

const mentions = async () => (await jane('GET', '/api/notifications')).data.filter((n) => n.type === 'mention').length;

async function timed(body) {
  const start = performance.now();
  const res = await owner('POST', `/api/tasks/${ids.task}/comments`, { body });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return performance.now() - start;
}

const median = (list) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];

before(async () => {
  srv = await startServer();
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await jane.wallet(wallet(), 'invite', { name: 'Jane Doe', inviteToken: inv.data.token });
  ids.task = (await owner('POST', '/api/tasks', { title: 'Write the release notes' })).data.task.id;
});
after(() => srv.close());

test('trailing dots and dashes are punctuation, and a token longer than any name matches nobody', async () => {
  const before = await mentions();
  await timed('Thanks @JaneDoe.');
  await timed('Over to you, @jane--');
  assert.equal(await mentions(), before + 2);
  await timed(`@JaneDoe${'x'.repeat(100)}`);
  await timed(`@Jane${'.'.repeat(5000)}`);
  assert.equal(await mentions(), before + 3, 'the run of dots is cut off, so @Jane still matches');
  await timed(`@${'J'.repeat(81)}`);
  assert.equal(await mentions(), before + 3);
});

test('a comment built to slow the parser down costs about what a normal one does', async (t) => {
  const normal = [];
  const crafted = [];
  for (let i = 0; i < 8; i++) {
    normal.push(await timed('hello '.repeat(1666)));
    crafted.push(await timed(`@a${'.'.repeat(9997)}b`), await timed(`@a${'-'.repeat(9997)}b`));
  }
  t.diagnostic(`median: normal ${median(normal).toFixed(1)} ms, crafted ${median(crafted).toFixed(1)} ms`);
  assert.ok(median(crafted) < median(normal) * 3 + 20, `crafted ${median(crafted).toFixed(1)} ms against normal ${median(normal).toFixed(1)} ms`);

  // twenty at once take about as long as twenty normal ones
  const flood = async (body) => {
    const start = performance.now();
    await Promise.all(Array.from({ length: 20 }, () => timed(body)));
    return performance.now() - start;
  };
  const plain = await flood('hello '.repeat(1666));
  const built = await flood(`@a${'.'.repeat(9997)}b`);
  t.diagnostic(`20 at once: normal ${plain.toFixed(0)} ms, crafted ${built.toFixed(0)} ms`);
  assert.ok(built < plain * 3 + 200, `twenty crafted comments took ${built.toFixed(0)} ms against ${plain.toFixed(0)} ms for normal ones`);
});
