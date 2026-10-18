import { route, sent } from './helpers/fakeTab.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import wallet from '../../server/test/helpers/wallet.js';
import store from '../src/state/store.ts';
import identity from '../src/actions/identity.ts';
import votes from '../src/actions/votes.ts';
import applyForBounty from '../src/actions/applyForBounty.ts';
import walletWraps from '../src/actions/walletWraps.ts';
import unlockMessage from '../src/lib/crypto/unlockMessage.ts';
import keyStatement from '../src/lib/crypto/keyStatement.ts';
import wrapIdentity from '../src/lib/crypto/wrapIdentity.ts';
import recoverAddress from '../src/lib/crypto/recoverAddress.ts';

const ORIGIN = 'https://nil.example';
const WSKEY = 'workspace-key-abc';
const w = wallet();
// what the wallet was asked to sign, as text
const signed = [];
window.ethereum = {
  async request({ method, params }) {
    if (method === 'eth_requestAccounts') return [w.address];
    if (method === 'eth_chainId') return '0x1';
    if (method === 'personal_sign') {
      const text = Buffer.from(params[0].slice(2), 'hex').toString('utf8');
      signed.push(text);
      return w.sign(text);
    }
    throw new Error(`unexpected ${method}`);
  },
};
store.set({ phase: 'ready', origin: ORIGIN, workspaceKey: WSKEY, me: { id: 'u-ann', name: 'Ann' } });

const posted = (pattern) => sent.some((r) => r.method === 'POST' && pattern.test(r.url));

test('a server can’t get a key message signed as a bounty application, sign-in or ballot', async () => {
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const wrap = await walletWraps.make(seed, w.address);
  signed.length = 0;
  // the very message whose signature opens this member's wrap, which the server stores
  const unlock = unlockMessage({ origin: ORIGIN, workspaceKey: WSKEY, userId: 'u-ann', address: w.address, nonce: wrap.nonce, issuedAt: wrap.issuedAt });
  assert.deepEqual(await wrapIdentity.open(wrap.wrapped, w.sign(unlock), { userId: 'u-ann', address: w.address }), seed);
  const statement = keyStatement({ origin: ORIGIN, workspaceKey: WSKEY, userId: 'u-ann', address: w.address, publicKey: 'server-key', signingKey: 'server-signing-key', createdAt: Date.now() });

  for (const message of [unlock, statement]) {
    route('POST', '/api/public/bounties/b1/challenge', () => ({ challengeId: 'c1', message }));
    route('POST', '/api/auth/wallet/challenge', () => ({ challengeId: 'c2', message }));
    route('POST', '/api/proposals/p1/ballot', () => ({ ballotId: 'b1', message }));
    await assert.rejects(applyForBounty('b1', 'Ann', 'I can do it'), /key message/);
    await assert.rejects(identity.walletLogin(), /key message/);
    await assert.rejects(votes.cast('p1', 0), /key message/);
  }
  assert.deepEqual(signed, []);
  assert.equal(posted(/\/apply$|\/verify$|\/vote$/), false);
});

test('ordinary server text is signed exactly as written', async () => {
  const message = 'nil.example wants you to sign in with your Ethereum account:\nApply for bounty b1';
  route('POST', '/api/public/bounties/b1/challenge', () => ({ challengeId: 'c1', message }));
  route('POST', '/api/public/bounties/b1/apply', () => ({ ok: true }));
  await applyForBounty('b1', 'Ann', 'I can do it');
  const apply = sent.findLast((r) => r.url === '/api/public/bounties/b1/apply');
  assert.equal(apply.body.challengeId, 'c1');
  assert.equal(recoverAddress(message, apply.body.signature), w.address);
});

test('nothing but text goes to the wallet', async () => {
  signed.length = 0;
  route('POST', '/api/public/bounties/b1/challenge', () => ({ challengeId: 'c1', message: { raw: '0x1234' } }));
  await assert.rejects(applyForBounty('b1', 'Ann', ''), /isn’t text/);
  assert.deepEqual(signed, []);
});

// Key messages are built in the browser and are the only text signed without the check, so
// every direct call to ethereum.sign has to sit next to the builder of one.
test('only key messages built in this browser skip the check', () => {
  const src = path.resolve(import.meta.dirname, '../src');
  const files = fs.readdirSync(src, { recursive: true }).filter((f) => /\.tsx?$/.test(f));
  const callers = files.filter((f) => /ethereum\.sign\(/.test(fs.readFileSync(path.join(src, f), 'utf8')));
  for (const f of callers) {
    const text = fs.readFileSync(path.join(src, f), 'utf8');
    const buildsKeyMessage = /from '\.\.\/lib\/crypto\/(unlockMessage|keyStatement)'/.test(text);
    assert.ok(f === path.join('lib', 'signServerText.ts') || buildsKeyMessage, `${f} signs with ethereum.sign directly; use signServerText for text from the server`);
  }
  assert.ok(callers.length >= 3);
  const personalSign = files.filter((f) => /'personal_sign'/.test(fs.readFileSync(path.join(src, f), 'utf8')));
  assert.deepEqual(personalSign, [path.join('lib', 'ethereum.ts')]);
});
