import { test } from 'node:test';
import assert from 'node:assert/strict';
import createLimiter from '../signup/createLimiter.js';
import ipKey from '../signup/ipKey.js';
import clientIp from '../signup/clientIp.js';
import proofOfWork from '../signup/proofOfWork.js';

test('a fixed window allows max hits, then refuses until the window resets', () => {
  let now = 0;
  const limiter = createLimiter({ windowMs: 60_000, max: 3, now: () => now });
  for (let i = 0; i < 3; i++) assert.deepEqual(limiter.hit('a'), { ok: true });
  assert.deepEqual(limiter.hit('a'), { ok: false, retryAfterSec: 60 });
  assert.deepEqual(limiter.hit('b'), { ok: true }, 'keys are counted separately');
  now = 45_000;
  assert.deepEqual(limiter.hit('a'), { ok: false, retryAfterSec: 15 });
  now = 60_000;
  assert.deepEqual(limiter.hit('a'), { ok: true });
});

test('a flood of distinct keys can’t grow the limiter without bound', () => {
  const limiter = createLimiter({ windowMs: 60_000, max: 1, maxKeys: 100 });
  for (let i = 0; i < 1000; i++) limiter.hit(`k${i}`);
  assert.ok(limiter.size() <= 100);
});

test('IPv4 counts per address, IPv6 per /56, and blocks are a /24 or a /48', () => {
  assert.equal(ipKey('203.0.113.9'), '203.0.113.9');
  assert.equal(ipKey('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(ipKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:0::/56');
  assert.equal(ipKey('2001:db8:1:ff::1'), '2001:db8:1:0::/56', 'every /64 of one /56 is the same network');
  assert.equal(ipKey('2001:0db8:0001:0102:0:0:0:1'), '2001:db8:1:100::/56');
  assert.equal(ipKey('2001:db8::1'), '2001:db8:0:0::/56');
  assert.equal(ipKey('::1'), '0:0:0:0::/56');
  assert.equal(ipKey('64:ff9b::198.51.100.7'), '64:ff9b:0:0::/56');
  assert.equal(ipKey('not an ip'), 'unknown');
  assert.equal(ipKey('203.0.113.9', { wide: true }), '203.0.113.0/24');
  assert.equal(ipKey('2001:db8:1:ff00::1', { wide: true }), '2001:db8:1::/48');
  assert.equal(ipKey('not an ip', { wide: true }), 'unknown');
});

test('a limiter can be asked without counting', () => {
  const limiter = createLimiter({ windowMs: 60_000, max: 1, now: () => 0 });
  assert.deepEqual(limiter.check('a'), { ok: true });
  assert.deepEqual(limiter.check('a'), { ok: true });
  limiter.hit('a');
  assert.deepEqual(limiter.check('a'), { ok: false, retryAfterSec: 60 });
});

test('behind one proxy the client is the last forwarded address, never one the visitor wrote', () => {
  const req = (xff, remote = '172.18.0.5') => ({ headers: xff ? { 'x-forwarded-for': xff } : {}, socket: { remoteAddress: remote } });
  assert.equal(clientIp(req('6.6.6.6, 203.0.113.9'), 1), '203.0.113.9');
  assert.equal(clientIp(req('203.0.113.9'), 1), '203.0.113.9');
  assert.equal(clientIp(req(null), 1), '172.18.0.5');
  assert.equal(clientIp(req('6.6.6.6'), 0), '172.18.0.5', 'without a trusted proxy the header is ignored');
});

test('the proof-of-work puzzle is cheap to check and has to be solved', () => {
  const nonce = proofOfWork.solve('salt', 12);
  assert.equal(proofOfWork.verify('salt', nonce, 12), true);
  assert.equal(proofOfWork.verify('other salt', nonce, 12) && proofOfWork.verify('other salt 2', nonce, 12), false);
  assert.equal(proofOfWork.verify('salt', 'abc', 12), false);
  assert.equal(proofOfWork.verify('salt', undefined, 0), true, 'zero bits turns the puzzle off');
});
