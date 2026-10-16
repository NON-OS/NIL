import { test } from 'node:test';
import assert from 'node:assert/strict';
import nameCheck from '../names/nameCheck.js';
import nameStatus from '../names/nameStatus.js';
import createWorkspace from '../provisioning/createWorkspace.js';
import testContext from './helpers/testContext.js';

const OWNER = `0x${'a'.repeat(40)}`;
const DAY = 86_400_000;

test('workspace addresses are short lowercase DNS labels', () => {
  const rules = testContext().config.signup;
  for (const name of ['team', 'acme-labs', 'dao42', 'a1b', 'x'.repeat(32)]) assert.equal(nameCheck(name, rules).ok, true, name);
  assert.equal(nameCheck('  Team ', rules).name, 'team');
  const refused = {
    '': /Pick/,
    ab: /at least 3/,
    ['x'.repeat(33)]: /at most 32/,
    'team space': /lowercase letters/,
    'tëam': /lowercase letters/,
    'team.space': /lowercase letters/,
    '-team': /dash/,
    'team-': /dash/,
    'xn--80ak6aa92e': /single dashes/,
    'my--team': /single dashes/,
    12345: /letter/,
  };
  for (const [name, reason] of Object.entries(refused)) {
    const result = nameCheck(name, rules);
    assert.equal(result.ok, false, name);
    assert.match(result.reason, reason, name);
  }
});

test('reserved names and look-alikes of wallet brands are refused', () => {
  const ctx = testContext({ env: { CLOUD_RESERVED_NAMES: 'nonos-labs, Treasury' } });
  const rules = ctx.config.signup;
  for (const name of ['www', 'admin', 'api', 'nonos', 'nil', 'nonos-labs', 'treasury']) assert.match(nameCheck(name, rules).reason, /reserved/, name);
  for (const name of ['metamask', 'meta-mask-help', 'm3tamask', 'c0inbase-support', 'tr3zor', 'airdrop-claims', 'seed-phrase']) assert.match(nameCheck(name, rules).reason, /isn’t available/, name);
  // ordinary words that merely share letters are fine
  for (const name of ['metadata', 'coin-club', 'ledger-books', 'seeds']) assert.equal(nameCheck(name, rules).ok, true, name);
});

test('a name is taken while in use, then quarantined for a while after deletion', () => {
  let now = Date.UTC(2026, 0, 1);
  const ctx = testContext({ now: () => now });
  const ws = createWorkspace(ctx, { name: 'acme', owner: OWNER });
  assert.deepEqual(nameStatus(ctx, 'acme'), { available: false, name: 'acme', reason: 'That address is taken.' });
  ctx.store.workspaces.transition(ws.id, ['provisioning'], 'deleted', { deletedAt: now });
  assert.match(nameStatus(ctx, 'acme').reason, /in use recently/);
  now += 91 * DAY;
  assert.equal(nameStatus(ctx, 'acme').available, true);
});

test('the operator can use reserved names, and reuse a quarantined one, but never a live one', () => {
  const ctx = testContext();
  assert.throws(() => createWorkspace(ctx, { name: 'nonos', owner: OWNER }), /reserved/);
  const own = createWorkspace(ctx, { name: 'nonos', owner: OWNER, anyName: true });
  assert.equal(own.name, 'nonos');
  assert.throws(() => createWorkspace(ctx, { name: 'nonos', owner: OWNER, anyName: true }), /taken/);
  assert.throws(() => createWorkspace(ctx, { name: 'Bad Name', owner: OWNER, anyName: true }), /lowercase/);
});

test('a workspace needs a real owner address and an existing plan', () => {
  const ctx = testContext();
  assert.throws(() => createWorkspace(ctx, { name: 'acme', owner: '0x123' }), /Ethereum address/);
  assert.throws(() => createWorkspace(ctx, { name: 'acme', owner: OWNER, plan: 'gold' }), /no plan called gold/);
  const ws = createWorkspace(ctx, { name: 'acme', owner: OWNER.toUpperCase().replace('0X', '0x') });
  assert.equal(ws.owner, OWNER);
  assert.match(ws.setupToken, /^[A-Za-z0-9_-]{32}$/);
  assert.match(ws.id, /^[0-9a-f]{16}$/);
});
