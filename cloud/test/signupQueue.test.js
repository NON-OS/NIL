import { test } from 'node:test';
import assert from 'node:assert/strict';
import createSignupFlow from '../signup/createSignupFlow.js';
import proofOfWork from '../signup/proofOfWork.js';
import provisionWorkspace from '../provisioning/provisionWorkspace.js';
import requests from '../cli/commands/requests.js';
import housekeeping from '../ops/housekeeping.js';
import testContext from './helpers/testContext.js';
import wallet from './helpers/wallet.js';

const DAY = 86_400_000;

function setup(env, now) {
  const ctx = testContext({ env, now });
  const flow = createSignupFlow(ctx, { provision: (id) => provisionWorkspace(ctx, id), now });
  return { ctx, flow };
}

function signUp(flow, w, name, ip) {
  const c = flow.challenge({ name, address: w.address }, ip);
  return flow.verify({ challengeId: c.challengeId, signature: w.sign(c.message), nonce: proofOfWork.solve(c.pow.salt, c.pow.bits) }, ip);
}

const cli = async (ctx, command, ...args) => {
  const lines = [];
  const code = await requests(ctx, { command, args, options: {}, print: (line) => lines.push(line) });
  return { code, out: lines.join('\n') };
};

test('past the daily cap a signed sign-up waits for approval, holding its name, with its code shown at once', async () => {
  const { ctx, flow } = setup({ CLOUD_SIGNUPS_PER_DAY: '2', CLOUD_MAX_PER_WALLET: '1' });
  signUp(flow, wallet(), 'first', '192.0.2.1');
  signUp(flow, wallet(), 'second', '192.0.2.2');
  const w = wallet();
  const waiting = signUp(flow, w, 'third', '192.0.2.3');
  assert.equal(waiting.queued, true);
  assert.equal(waiting.url, 'https://third.nil.test');
  assert.ok(waiting.setupToken.length >= 24);
  assert.equal(waiting.ticket, undefined, 'nothing to wait for on the page');
  assert.equal(ctx.store.workspaces.byName('third'), null);
  assert.equal(ctx.alerts.at(-1).event, 'signup.waiting');

  assert.equal(flow.checkName('third', '192.0.2.9').available, false, 'the name is held while it waits');
  assert.throws(() => flow.challenge({ name: 'third', address: wallet().address }, '192.0.2.9'), /taken/);
  assert.throws(() => flow.challenge({ name: 'fourth', address: w.address }, '192.0.2.3'), /already has 1 workspaces/, 'a waiting sign-up counts for its wallet');

  assert.match((await cli(ctx, 'requests')).out, /third\s+0x/);
  assert.equal((await cli(ctx, 'approve', 'third')).code, 0);
  const approved = ctx.store.workspaces.byName('third');
  assert.equal(approved.state, 'active');
  assert.equal(approved.setupToken, waiting.setupToken, 'the code shown at sign-up is the one that works');
  assert.equal(approved.owner, w.address);
  assert.match((await cli(ctx, 'requests')).out, /No sign-ups are waiting/);
});

test('the last places on the server go out by hand, and requests nobody approves expire', async () => {
  let now = Date.UTC(2026, 9, 21, 12);
  const { ctx, flow } = setup({ CLOUD_MAX_WORKSPACES: '10', CLOUD_APPROVAL_ABOVE_PERCENT: '20' }, () => now);
  signUp(flow, wallet(), 'one', '192.0.2.1');
  signUp(flow, wallet(), 'two', '198.51.100.2');
  assert.equal(signUp(flow, wallet(), 'three', '203.0.113.3').queued, true);
  assert.equal(signUp(flow, wallet(), 'four', '2001:db8:4::1').queued, true);
  assert.equal((await cli(ctx, 'reject', 'four')).code, 0);
  assert.equal(flow.checkName('four', '192.0.2.9').available, true, 'a rejected address is free again');
  await assert.rejects(cli(ctx, 'approve', 'four'), /No sign-up called four/);

  now += 8 * DAY;
  await housekeeping(ctx);
  assert.equal(ctx.store.requests.list().length, 0);
  assert.equal(flow.checkName('three', '192.0.2.9').available, true);
});
