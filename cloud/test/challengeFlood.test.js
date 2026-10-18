// From the infrastructure audit: a flood of wallet challenges from one /48 used to push a real
// visitor's pending challenge out of a 5,000-entry list. Challenges are now limited per network
// and per block, and carry their own state, so nothing can push anyone's out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import createSignupFlow from '../signup/createSignupFlow.js';
import proofOfWork from '../signup/proofOfWork.js';
import testContext from './helpers/testContext.js';
import wallet from './helpers/wallet.js';

test('a challenge flood from one /48 neither gets through nor evicts a real visitor’s challenge', () => {
  const ctx = testContext();
  const flow = createSignupFlow(ctx, { provision: () => Promise.resolve() });
  const victim = wallet();
  const c = flow.challenge({ name: 'real-team', address: victim.address }, '198.51.100.9');
  const junk = `0x${'1'.repeat(40)}`;
  let issued = 0;
  for (let i = 0; i < 5000; i++) {
    try {
      flow.challenge({ name: `x${i}-a`, address: junk }, `2001:db8:77:${(i % 65536).toString(16)}::1`);
      issued++;
    } catch (err) {
      assert.equal(err.status, 429);
    }
  }
  assert.ok(issued <= ctx.config.signup.challengesPerBlock, `${issued} challenges went out to one /48`);
  const created = flow.verify({ challengeId: c.challengeId, signature: victim.sign(c.message), nonce: proofOfWork.solve(c.challengeId, 4) }, '198.51.100.9');
  assert.equal(created.name, 'real-team');
});

test('a sealed challenge can’t be forged, edited or used twice', () => {
  const ctx = testContext();
  const flow = createSignupFlow(ctx, { provision: () => Promise.resolve() });
  const other = createSignupFlow(ctx, { provision: () => Promise.resolve() });
  const w = wallet();
  const c = flow.challenge({ name: 'sealed', address: w.address }, '198.51.100.30');
  const answer = (id) => ({ challengeId: id, signature: w.sign(c.message), nonce: proofOfWork.solve(id, 4) });
  const [body, mac] = c.challengeId.split('.');
  const edited = `${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), name: 'stolen' })).toString('base64url')}.${mac}`;
  assert.throws(() => flow.verify(answer(edited), '198.51.100.30'), /expired/);
  assert.throws(() => other.verify(answer(c.challengeId), '198.51.100.30'), /expired/, 'another process’s key doesn’t open it');
  assert.equal(flow.verify(answer(c.challengeId), '198.51.100.30').name, 'sealed');
  assert.throws(() => flow.verify(answer(c.challengeId), '198.51.100.30'), /expired/);
});
