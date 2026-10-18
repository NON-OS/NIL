import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Identity } from '@semaphore-protocol/identity';
import serverMessage from '../../server/aiCredits/creditMessage.js';
import creditScope from '../src/lib/aiCredit/creditScope.ts';
import creditMessage from '../src/lib/aiCredit/creditMessage.ts';
import freeSlot from '../src/lib/aiCredit/freeSlot.ts';
import ballotNullifier from '../src/lib/semaphore/ballotNullifier.ts';

// the server's scope reads the workspace key from its data folder, so it gets a throwaway one
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-ai-credit-'));
Object.assign(process.env, { DATA_DIR: dataDir, APP_URL: 'http://localhost:3000', NOX_RPC_URL: 'off' });
const { default: serverScope } = await import('../../server/aiCredits/creditScope.js');
const { default: signingKey } = await import('../../server/proofs/signingKey.js');
process.on('exit', () => fs.rmSync(dataDir, { recursive: true, force: true }));

test('the browser works out the same scopes and messages as the server', () => {
  const key = signingKey.publicKey();
  for (const [day, slot] of [['2026-10-21', 0], ['2026-10-21', 7], ['2026-12-31', 99]]) assert.equal(creditScope(key, day, slot), serverScope(day, slot));
  const payload = JSON.stringify({ instruction: 'A launch plan, with “quotes” and ünïcode', title: '', context: '' });
  assert.equal(creditMessage('draft', payload), serverMessage('draft', payload));
  // every slot, day and feature lands somewhere different
  assert.notEqual(creditScope(key, '2026-10-21', 0), creditScope(key, '2026-10-21', 1));
  assert.notEqual(creditScope(key, '2026-10-21', 0), creditScope(key, '2026-10-22', 0));
  assert.notEqual(creditMessage('draft', payload), creditMessage('extract', payload));
});

test('a free slot is one this identity hasn’t spent today, picked at random', () => {
  const me = new Identity('free-slot-test');
  const day = '2026-10-21';
  const mine = (slot) => ballotNullifier(me.secretScalar, creditScope('wk', day, slot));
  const someoneElse = ballotNullifier(new Identity('someone-else').secretScalar, creditScope('wk', day, 2));
  assert.equal(freeSlot(me.secretScalar, 'wk', day, 3, [mine(0), mine(1), someoneElse]), 2);
  assert.equal(freeSlot(me.secretScalar, 'wk', day, 3, [mine(0), mine(1), mine(2)]), null);
  const picks = new Set(Array.from({ length: 60 }, () => freeSlot(me.secretScalar, 'wk', day, 5, [])));
  assert.ok(picks.size > 1, 'slots come in random order');
});
