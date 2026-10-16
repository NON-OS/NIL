import { test } from 'node:test';
import assert from 'node:assert/strict';
import loadConfig from '../config/loadConfig.js';
import openDatabase from '../db/openDatabase.js';
import createStore from '../store/createStore.js';
import workspaceSpec from '../runtime/workspaceSpec.js';
import baseEnv from './helpers/baseEnv.js';

const KEY = 'a'.repeat(64);
const make = (store, name) => store.workspaces.insert({ id: name.padEnd(16, '0'), name, owner: null, state: 'provisioning', image: 'nonos/nil:1.0.0', plan: 'standard', volume: `nil-${name}-data` });

test('every workspace gets its own invoice slot, never handed out twice', () => {
  const db = openDatabase(':memory:');
  const store = createStore(db);
  const slots = ['acme', 'globex', 'initech'].map((name) => make(store, name).invoiceSlot);
  assert.deepEqual(slots, [0, 1, 2]);
  // a deleted workspace keeps its slot, so its old invoices can't collide with a newcomer's
  db.exec("UPDATE workspaces SET state = 'deleted' WHERE name = 'initech'");
  assert.equal(make(store, 'umbrella').invoiceSlot, 3);
});

test('a workspace bills with its slot and the shared key, and only when both are set', () => {
  const { config, errors } = loadConfig({ ...baseEnv, CLOUD_INVOICE_KEY: KEY, CLOUD_INVOICE_SLOTS: '50' });
  assert.deepEqual(errors, []);
  const env = workspaceSpec(config, { id: 'x', name: 'acme', image: 'i', volume: 'v', plan: 'standard', invoiceSlot: 7 }).env;
  assert.deepEqual([env.PLAN_INVOICE_SLOT, env.PLAN_INVOICE_KEY], ['7/50', KEY]);

  const keyless = loadConfig({ ...baseEnv, CLOUD_INVOICE_KEY: '', CLOUD_INVOICE_SLOTS: '50' });
  assert.ok(keyless.warnings.some((w) => w.includes('CLOUD_INVOICE_KEY')));
  assert.equal(workspaceSpec(keyless.config, { id: 'x', name: 'acme', image: 'i', volume: 'v', plan: 'standard', invoiceSlot: 7 }).env.PLAN_INVOICE_SLOT, undefined);
});

test('more slots than the invoice digits can hold is refused', () => {
  assert.ok(loadConfig({ ...baseEnv, CLOUD_INVOICE_KEY: KEY, CLOUD_INVOICE_SLOTS: '10000' }).errors.some((e) => e.includes('PLAN_SUFFIX_DIGITS')));
  assert.ok(loadConfig({ ...baseEnv, CLOUD_INVOICE_KEY: 'short' }).errors.some((e) => e.includes('at least 32')));
});
