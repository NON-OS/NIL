import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import newStealthPayment from '../src/lib/stealth/newStealthPayment.ts';
import stealthKey from '../src/lib/stealth/stealthKey.ts';
import metaAddress from '../src/lib/stealth/metaAddress.ts';
import registerKeysCall from '../src/lib/stealth/registerKeysCall.ts';
import selector from '../../server/chain/selector.js';
import abiWithBytes from '../../server/chain/abiWithBytes.js';
import decodeRegistryMeta from '../../server/stealth/decodeRegistryMeta.js';
import mockChain from '../../server/test/helpers/mockChain.js';

const VECTORS = JSON.parse(fs.readFileSync(new URL('../../server/test/fixtures/stealthVectors.json', import.meta.url)));
const bytes = (hex) => hexToBytes(hex.slice(2));
const word = (n) => n.toString(16).padStart(64, '0');
// the 66 bytes a wallet registers: everything after "st:eth:0x"
const registered = (meta) => meta.slice('st:eth:0x'.length);
// stealthMetaAddressOf's answer: ABI-encoded bytes
const answer = (body, offset = 32) => `0x${word(offset)}${word(body.length / 2)}${body.padEnd(Math.ceil(body.length / 64) * 64, '0')}`;

test('the payer’s one-time address and the payee’s key match the ERC-5564 reference byte for byte', () => {
  for (const v of VECTORS) {
    assert.equal(metaAddress(bytes(v.spendingKey), bytes(v.viewingKey)), v.meta);
    const paid = newStealthPayment(v.meta, () => bytes(v.ephemeralKey));
    assert.deepEqual(paid, { address: v.stealthAddress, ephemeralPublicKey: v.ephemeralPublicKey, viewTag: Number(v.viewTag) });
    const opened = stealthKey(bytes(v.spendingKey), bytes(v.viewingKey), v.ephemeralPublicKey);
    assert.equal(opened.address, v.stealthAddress);
    assert.equal(`0x${bytesToHex(opened.privateKey)}`, v.stealthKey);
  }
});

test('a new one-time payment hands back only public values, and wipes its ephemeral key', () => {
  let picked;
  const paid = newStealthPayment(VECTORS[0].meta, () => (picked = bytes(VECTORS[0].ephemeralKey)));
  assert.deepEqual(Object.keys(paid).sort(), ['address', 'ephemeralPublicKey', 'viewTag']);
  assert.ok(picked.every((b) => b === 0));
  assert.notEqual(newStealthPayment(VECTORS[0].meta).address, newStealthPayment(VECTORS[0].meta).address);
});

test('registerKeys call data is what the ERC-6538 registry expects', () => {
  for (const v of VECTORS) assert.equal(registerKeysCall(v.meta), `0x${selector('registerKeys(uint256,bytes)')}${abiWithBytes(['1'], registered(v.meta))}`);
  // spelled out once: the selector, scheme 1, where the bytes start, 66 of them, padded to three words
  const call = registerKeysCall(VECTORS[0].meta.toUpperCase().replace('ST:ETH:0X', 'st:eth:0x'));
  assert.equal(call, `0x042c7aa3${word(1)}${word(0x40)}${word(66)}${registered(VECTORS[0].meta).padEnd(192, '0')}`);
  assert.throws(() => registerKeysCall('st:eth:0x1234'), /malformed/);
  assert.throws(() => registerKeysCall(`st:eth:0x04${registered(VECTORS[0].meta).slice(2)}`), /malformed/);
});

test('what a wallet registers reads back from the registry as the same meta-address', async () => {
  const chain = mockChain();
  await new Promise((resolve) => chain.server.listen(0, '127.0.0.1', resolve));
  const read = async (wallet) => {
    const call = { to: chain.registry, data: `0x${selector('stealthMetaAddressOf(address,uint256)')}${wallet.slice(2).padStart(64, '0')}${word(1)}` };
    const res = await fetch(`http://127.0.0.1:${chain.server.address().port}`, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [call, 'latest'] }) });
    return decodeRegistryMeta((await res.json()).result);
  };
  try {
    const wallet = `0x${'12'.repeat(20)}`;
    assert.deepEqual(await read(wallet), { state: 'none' });
    assert.ok(chain.registerKeys(wallet, registerKeysCall(VECTORS[1].meta)));
    assert.deepEqual(await read(wallet), { state: 'found', metaAddress: VECTORS[1].meta });
  } finally {
    chain.server.close();
  }
});

test('a registry answer that isn’t one scheme 1 meta-address decodes as invalid, or as nothing', () => {
  const meta = registered(VECTORS[0].meta);
  assert.deepEqual(decodeRegistryMeta(answer(meta)), { state: 'found', metaAddress: VECTORS[0].meta });
  assert.deepEqual(decodeRegistryMeta(answer(meta.toUpperCase())), { state: 'found', metaAddress: VECTORS[0].meta });
  for (const none of ['0x', '', null, answer('')]) assert.deepEqual(decodeRegistryMeta(none), { state: 'none' });
  const invalid = {
    short: answer(meta.slice(0, -2)),
    long: answer(`${meta}00`),
    offCurve: answer(`${meta.slice(0, 66)}02${'f'.repeat(64)}`),
    uncompressed: answer(`04${meta.slice(2)}`),
    truncated: answer(meta).slice(0, 2 + 128 + 100),
    offsetOutside: answer(meta, 4096),
    notHex: `0x${'zz'.repeat(160)}`,
    oddLength: `${answer(meta)}0`,
  };
  for (const [name, hex] of Object.entries(invalid)) assert.deepEqual(decodeRegistryMeta(hex), { state: 'invalid' }, name);
});
