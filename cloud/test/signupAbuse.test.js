// From the infrastructure audit: sign-up capacity exhaustion from one IPv6 /48, and invoice-slot
// reuse. Both used to succeed; they now have to fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import createSignupFlow from '../signup/createSignupFlow.js';
import proofOfWork from '../signup/proofOfWork.js';
import provisionWorkspace from '../provisioning/provisionWorkspace.js';
import testContext from './helpers/testContext.js';
import wallet from './helpers/wallet.js';
import ipKey from '../signup/ipKey.js';

function signUp(flow, w, name, ip) {
  const c = flow.challenge({ name, address: w.address, chainId: 1 }, ip);
  return flow.verify({ challengeId: c.challengeId, signature: w.sign(c.message), nonce: proofOfWork.solve(c.pow.salt, c.pow.bits) }, ip);
}

function attempt(flow, w, name, ip) {
  try {
    signUp(flow, w, name, ip);
    return true;
  } catch (err) {
    assert.equal(err.status, 429, err.message);
    return false;
  }
}

test('one /48 with fresh wallets can no longer use up sign-ups and lock everyone else out', async () => {
  // the production proof of work, 16 bits
  const ctx = testContext({ env: { CLOUD_POW_BITS: '16' } });
  const ps = [];
  const flow = createSignupFlow(ctx, { provision: (id) => { const p = provisionWorkspace(ctx, id); ps.push(p); return p; } });
  // each a different /64 inside one /56, as in the audit
  let created = 0;
  for (let i = 0; i < 30; i++) if (attempt(flow, wallet(), `squat-${i}`, `2001:db8:1234:${i.toString(16)}::1`)) created++;
  assert.equal(ipKey('2001:db8:1234:0::1'), ipKey('2001:db8:1234:1d::1'), 'the /64s count as one network');
  assert.equal(created, ctx.config.signup.perIpPerDay);
  // and spread over different /56s of the same /48, the block's hourly budget stops it
  for (let i = 1; i < 30; i++) if (attempt(flow, wallet(), `spread-${i}`, `2001:db8:1234:${(i * 256).toString(16)}::1`)) created++;
  assert.ok(created <= ctx.config.signup.perIpPerDay + ctx.config.signup.perBlockPerHour, `${created} sign-ups from one /48`);
  await Promise.allSettled(ps);
  const legit = signUp(flow, wallet(), 'legit-team', '198.51.100.20');
  assert.equal(legit.name, 'legit-team', 'someone on another network still gets in');
});

test('invoice slots are never reused, not even once the highest-slot row is forgotten', async () => {
  const ctx = testContext();
  const flow = createSignupFlow(ctx, { provision: () => Promise.resolve() });
  signUp(flow, wallet(), 'aaa-team', '198.51.100.1');
  signUp(flow, wallet(), 'bbb-team', '198.51.100.2');
  const b = ctx.store.workspaces.byName('bbb-team');
  // the unclaimed-removal path: deleted, then forget()
  ctx.store.workspaces.transition(b.id, ['provisioning'], 'deleted', { deletedAt: Date.now() });
  ctx.store.workspaces.forget(b.id);
  signUp(flow, wallet(), 'ccc-team', '198.51.100.3');
  const c = ctx.store.workspaces.byName('ccc-team');
  assert.notEqual(c.invoiceSlot, b.invoiceSlot);
  assert.equal(c.invoiceSlot, b.invoiceSlot + 1);
});
