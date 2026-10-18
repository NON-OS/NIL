import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import relayedTransfers from '../pools/relayedTransfers.js';
import withdrawalContext from '../pools/withdrawalContext.js';
import grossAmount from '../pools/grossAmount.js';
import relayData from '../pools/relayData.js';
import poolEvent from '../pools/poolEvent.js';
import fieldList from '../pools/fieldList.js';

// The pure checks behind pool payouts, against real Sepolia receipts and the vectors the
// Privacy Pools SDK (1.5.0) produced for the same inputs.
const read = (name) => JSON.parse(fs.readFileSync(new URL(name, import.meta.url)));
const RELAY = read('./fixtures/sepoliaPoolRelay.json');
const DEPOSIT = read('./fixtures/sepoliaPoolDeposit.json');
const SDK = read('../../client/test/fixtures/poolVectors.json');
const SEPOLIA = { entrypoint: '0x34a2068192b1297f2a7f85d7d8cde66f8f0921cb', pool: '0x0b062fe33c4f1592d8ea63f9a0177fca44374c0f', token: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', to: '0x70f88b05fd0a80cc8f6742981668664017fe41a5' };

test('a real relayed withdrawal on Sepolia reads as exactly what reached its recipient', () => {
  assert.deepEqual(relayedTransfers(RELAY.logs, SEPOLIA), [{ token: SEPOLIA.token, from: SEPOLIA.entrypoint, to: SEPOLIA.to, value: 5002043n, gross: 5107252n, relayFee: 105209n }]);
});

test('the same withdrawal counts for nothing with any part changed', () => {
  const other = `0x${'12'.repeat(20)}`;
  for (const change of [{ to: other }, { pool: '0x6709277e170dee3e54101cdb73a450e392adff54' }, { entrypoint: other }, { token: other }]) {
    assert.deepEqual(relayedTransfers(RELAY.logs, { ...SEPOLIA, ...change }), [], JSON.stringify(change));
  }
  // removed logs (a reorg in progress) and a dropped Withdrawn or transfer break it
  assert.deepEqual(relayedTransfers(RELAY.logs.map((l) => ({ ...l, removed: true })), SEPOLIA), []);
  const withoutWithdrawn = RELAY.logs.filter((l) => l.address.toLowerCase() !== SEPOLIA.pool);
  assert.deepEqual(relayedTransfers(withoutWithdrawn, SEPOLIA), []);
  // the event claiming a smaller fee than the transfer shows
  const relayed = RELAY.logs.findIndex((l) => l.address.toLowerCase() === SEPOLIA.entrypoint && l.topics.length === 4);
  const forged = RELAY.logs.map((l, i) => (i === relayed ? { ...l, data: `${l.data.slice(0, 66)}${(105208n).toString(16).padStart(64, '0')}` } : l));
  assert.deepEqual(relayedTransfers(forged, SEPOLIA), []);
  // two WithdrawalRelayed events can't both lean on one withdrawal
  const doubled = [...RELAY.logs, { ...RELAY.logs[relayed], logIndex: '0xff' }];
  assert.equal(relayedTransfers(doubled, SEPOLIA).length, 1);
});

test('the withdrawal context matches the SDK’s calculateContext', () => {
  const ctx = withdrawalContext('0x34A2068192b1297f2a7f85D7D8CdE66F8F0921cB', SDK.relayData, BigInt(SDK.scope));
  assert.equal(`0x${ctx.toString(16).padStart(64, '0')}`, SDK.context);
  assert.deepEqual(relayData(SDK.relayData), { recipient: '0x1111111111111111111111111111111111111111', feeRecipient: '0x349746ab142b5d0d65899d9bcb6f2cd53ab084d8', feeBps: 42n });
  for (const bad of ['0x', `${SDK.relayData}00`, `0x${'f'.repeat(192)}`, null]) assert.equal(relayData(bad), null);
});

test('the gross leaves exactly the net after the entry contract’s fee, at the least cost', () => {
  for (const bps of [0n, 1n, 10n, 42n, 333n, 1000n, 3000n, 9999n]) {
    for (const net of [1n, 7n, 25_000_000n, 250_000_048_170n, 10n ** 24n + 3n]) {
      const gross = grossAmount(net, bps);
      assert.equal(gross - (gross * bps) / 10_000n, net);
      const less = gross - 1n;
      assert.ok(less - (less * bps) / 10_000n < net);
    }
  }
  assert.throws(() => grossAmount(0n, 10n));
  assert.throws(() => grossAmount(5n, 10_000n));
});

test('pool events decode from a real Sepolia deposit, and only from the pool that emitted them', () => {
  const events = DEPOSIT.logs.map((l) => poolEvent(l, SEPOLIA.pool)).filter(Boolean);
  assert.deepEqual(events.map((e) => e.type), ['leaf', 'deposit']);
  assert.deepEqual([events[1].value, events[1].precommitment, events[0].index], ['9900000', '18425468645384395585080451844517837181125279147054738401931729705840322156105', '308']);
  assert.equal(events[0].leaf, events[1].commitment);
  assert.deepEqual(DEPOSIT.logs.map((l) => poolEvent(l, SEPOLIA.entrypoint)).filter(Boolean), []);
  assert.equal(fieldList(['1', '21888242871839275222246405745257275088548364400416034343698204186575808495617']), null);
  assert.deepEqual(fieldList(['007']), ['7']);
});
