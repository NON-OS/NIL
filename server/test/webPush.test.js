import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import pushBrowser from './helpers/pushBrowser.js';

let encryptPayload;
let vapidJwt;
let pushEndpoint;
let pushPayload;

// settings are read on import, and the server won't load without its address
before(async () => {
  process.env.APP_URL ??= 'http://localhost:3000';
  ({ default: encryptPayload } = await import('../push/encryptPayload.js'));
  ({ default: vapidJwt } = await import('../push/vapidJwt.js'));
  ({ default: pushEndpoint } = await import('../push/pushEndpoint.js'));
  ({ default: pushPayload } = await import('../push/pushPayload.js'));
});

const VECTORS = JSON.parse(fs.readFileSync(new URL('./fixtures/webPushVectors.json', import.meta.url)));
const b64 = (s) => Buffer.from(s, 'base64url');
// Log lines look like "<time> WARN  [config] <message>"; only the message matters here.
const warningsIn = (stderr) => stderr.split('\n').filter((line) => line.includes(' [config] ')).map((line) => line.slice(line.indexOf('[config]')));

// Verifies an ES256 JWT the way a push service does, with the key from the "k" parameter.
function verifyJwt(token, rawKey) {
  const [header, claims, signature] = token.split('.');
  const point = b64(rawKey);
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') }, format: 'jwk' });
  const valid = crypto.verify('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }, b64(signature));
  return { valid, header: JSON.parse(b64(header)), claims: JSON.parse(b64(claims)) };
}

test('push encryption matches the RFC 8291 test vector byte for byte', () => {
  const v = VECTORS.rfc8291;
  const body = encryptPayload(v.plaintext, { p256dh: v.receiverPublic, auth: v.authSecret }, { salt: b64(v.salt), senderKey: v.senderPrivate });
  assert.equal(body.subarray(0, 86).toString('base64url'), v.header);
  assert.equal(body.subarray(86).toString('base64url'), v.ciphertext);
  assert.equal(body.toString('base64url'), v.body);

  // and the intermediate values, worked out the long way from the RFC's formulas
  const receiver = crypto.createECDH('prime256v1');
  receiver.setPrivateKey(b64(v.receiverPrivate));
  const shared = receiver.computeSecret(b64(v.senderPublic));
  assert.equal(shared.toString('base64url'), v.ecdhSecret);
  const prkKey = crypto.createHmac('sha256', b64(v.authSecret)).update(shared).digest();
  const ikm = crypto.createHmac('sha256', prkKey).update(Buffer.concat([Buffer.from('WebPush: info\0'), b64(v.receiverPublic), b64(v.senderPublic), Buffer.of(1)])).digest();
  assert.equal(ikm.toString('base64url'), v.ikm);
  const prk = crypto.createHmac('sha256', b64(v.salt)).update(ikm).digest();
  assert.equal(crypto.createHmac('sha256', prk).update('Content-Encoding: aes128gcm\0\x01').digest().subarray(0, 16).toString('base64url'), v.cek);
  assert.equal(crypto.createHmac('sha256', prk).update('Content-Encoding: nonce\0\x01').digest().subarray(0, 12).toString('base64url'), v.nonce);
});

test('every message gets a fresh salt and key, and padding hides its length', () => {
  const browser = pushBrowser('push.example.test');
  const keys = browser.subscription.keys;
  const short = encryptPayload(JSON.stringify({ title: 'Reminder' }), keys, { padTo: 1024 });
  const long = encryptPayload(JSON.stringify({ title: 'Due soon', body: 'x'.repeat(400) }), keys, { padTo: 1024 });
  assert.equal(short.length, long.length);
  assert.notEqual(short.subarray(0, 16).toString('hex'), long.subarray(0, 16).toString('hex'));
  assert.notEqual(short.subarray(21, 86).toString('hex'), long.subarray(21, 86).toString('hex'));
  assert.deepEqual(browser.open(short).message, { title: 'Reminder' });
  assert.equal(browser.open(long).paddedTo, 1024);
  assert.equal(browser.open(long).recordSize, 4096);

  assert.throws(() => encryptPayload('x'.repeat(4000), keys));
  assert.throws(() => encryptPayload('hi', { p256dh: keys.p256dh, auth: 'short' }));
  assert.throws(() => encryptPayload('hi', { p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: keys.auth }));
});

test('the VAPID token verifies like the RFC 8292 example and stays within 24 hours', () => {
  const example = VECTORS.rfc8292;
  const checked = verifyJwt(example.token, example.key);
  assert.equal(checked.valid, true);
  assert.deepEqual(checked.claims, example.claims);

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.of(4), b64(jwk.x), b64(jwk.y)]).toString('base64url');
  const expiresAt = Date.now() + 12 * 3_600_000;
  const token = vapidJwt({ audience: 'https://push.example.net', subject: 'mailto:ops@example.com', expiresAt, privateKey });
  // the header is byte for byte the RFC's
  assert.equal(token.split('.')[0], example.token.split('.')[0]);
  const ours = verifyJwt(token, raw);
  assert.equal(ours.valid, true);
  assert.deepEqual(ours.header, { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(ours.claims, { aud: 'https://push.example.net', exp: Math.floor(expiresAt / 1000), sub: 'mailto:ops@example.com' });
  assert.ok(ours.claims.exp * 1000 - Date.now() <= 24 * 3_600_000);
  assert.equal(b64(token.split('.')[2]).length, 64);
  assert.equal('sub' in verifyJwt(vapidJwt({ audience: 'https://a.example', expiresAt, privateKey }), raw).claims, false);
  // a token signed by another key doesn't pass
  assert.equal(verifyJwt(token, example.key).valid, false);
});

test('push goes only to the browser makers’ push services, over https', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://web.push.apple.com/QF3', 'https://wns2-bl2p.notify.windows.com/w/?token=abc']) {
    assert.ok(pushEndpoint(ok), ok);
  }
  for (const bad of [
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://user:pw@fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.evil.example/x',
    'https://notify.windows.com/w/',
    'https://127.0.0.1/push',
    'https://localhost/push',
    'https://169.254.169.254/latest/meta-data',
    'not a url',
    42,
    `https://fcm.googleapis.com/${'a'.repeat(2100)}`,
  ]) {
    assert.equal(pushEndpoint(bad), null, String(bad).slice(0, 60));
  }
});

test('a private task’s push says only what kind of note it is, whatever the device allows', () => {
  const secret = { id: 'task1', private: true, title: 'Buy the ring for Sam', sealed: null };
  for (const type of ['reminder', 'assigned', 'mention', 'due_soon', 'due_today']) {
    for (const names of [true, false]) {
      const message = pushPayload({ id: 7, type, task: secret, data: { title: secret.title, note: 'ring', excerpt: 'ring' }, actorName: 'Erik', names });
      assert.deepEqual(Object.keys(message).sort(), ['tag', 'task', 'title']);
      assert.equal(message.task, 'task1');
      assert.ok(['Reminder', 'A private task is due', 'A private task was assigned to you', 'You were mentioned on a private task'].includes(message.title), message.title);
      assert.equal(/ring|Sam|Erik/.test(JSON.stringify(message)), false);
    }
  }
});

test('a team task’s push names it only when the device allows, and never quotes a comment', () => {
  const task = { id: 't2', private: false, title: 'Ship the release notes' };
  const named = pushPayload({ id: 1, type: 'mention', task, data: { excerpt: 'secret comment text' }, actorName: 'Ana', names: true });
  assert.deepEqual(named, { title: 'Ana mentioned you', body: 'Ship the release notes', task: 't2', tag: 'nil-1' });
  const quiet = pushPayload({ id: 2, type: 'assigned', task, data: {}, actorName: 'Ana', names: false });
  assert.deepEqual(quiet, { title: 'A task was assigned to you', task: 't2', tag: 'nil-2' });
  assert.equal(JSON.stringify(named).includes('secret comment'), false);
  assert.equal(pushPayload({ id: 3, type: 'comment', task, data: {}, names: true }), null);
  assert.equal(pushPayload({ id: 4, type: 'status', task, data: {}, names: true }), null);
  assert.deepEqual(pushPayload({ id: 5, type: 'due_today', task: null, data: { count: 3 }, names: true }), { title: '3 tasks are due today', tag: 'nil-5' });
  assert.equal(pushPayload({ id: 6, type: 'reminder', task: null, data: { note: 'Call the accountant' }, names: false }).body, undefined);
  assert.equal(pushPayload({ id: 6, type: 'reminder', task: null, data: { note: 'Call the accountant' }, names: true }).body, 'Call the accountant');
  assert.equal(pushPayload({ id: 8, type: 'due_soon', task: { ...task, title: 'y'.repeat(500) }, names: true }).body.length, 160);
});

// Settings are read when the server starts, so these run in their own processes.
function loadKeys(env) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nonos-vapid-'));
  const module = new URL('../push/vapidKeys.js', import.meta.url).href;
  const script = `const { default: keys } = await import(${JSON.stringify(module)}); console.log(keys.publicKey());`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { PATH: process.env.PATH, APP_URL: 'http://localhost:3000', NOX_RPC_URL: 'off', DATA_DIR: dataDir, ...env }, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const file = path.join(dataDir, 'keys', 'push-vapid-p256.pem');
  const out = { publicKey: run.stdout.trim(), stored: fs.existsSync(file), mode: fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : null, warnings: warningsIn(run.stderr) };
  fs.rmSync(dataDir, { recursive: true, force: true });
  return out;
}

test('VAPID keys come from the settings when they form a pair, else from a file made on first start', () => {
  const generated = loadKeys({});
  assert.equal(b64(generated.publicKey).length, 65);
  assert.deepEqual([generated.stored, generated.mode, generated.warnings], [true, 0o600, []]);

  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const pair = { VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString('base64url'), VAPID_PRIVATE_KEY: ecdh.getPrivateKey().toString('base64url') };
  const configured = loadKeys(pair);
  assert.deepEqual([configured.publicKey, configured.stored, configured.warnings], [pair.VAPID_PUBLIC_KEY, false, []]);

  const mismatched = loadKeys({ ...pair, VAPID_PUBLIC_KEY: generated.publicKey });
  assert.notEqual(mismatched.publicKey, generated.publicKey);
  assert.equal(mismatched.stored, true);
  assert.match(mismatched.warnings.join('\n'), /VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY/);
  // the key itself never reaches the log
  assert.equal(mismatched.warnings.join('\n').includes(pair.VAPID_PRIVATE_KEY), false);
});

test('push settings that can’t be used are named at startup', () => {
  const module = new URL('../config.js', import.meta.url).href;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', `const { default: c } = await import(${JSON.stringify(module)}); console.log(JSON.stringify([c.push, c.due]));`], {
    env: { PATH: process.env.PATH, PUSH_SERVICES: 'push.example.test, http://evil, *.relay.example', VAPID_SUBJECT: 'ops@example.com', DUE_DAY_HOUR: '25', APP_URL: 'https://nil.example', NOX_RPC_URL: 'http://127.0.0.1:8545' },
    encoding: 'utf8',
  });
  const [push, due] = JSON.parse(run.stdout);
  assert.deepEqual(push.services, ['push.example.test', '*.relay.example']);
  assert.equal(push.subject, null);
  assert.deepEqual([due.soonMinutes, due.dayHour], [30, 9]);
  const warnings = warningsIn(run.stderr);
  assert.equal(warnings.length, 3);
  for (const name of ['PUSH_SERVICES', 'VAPID_SUBJECT', 'DUE_DAY_HOUR']) assert.ok(warnings.some((w) => w.includes(name)), name);
});
