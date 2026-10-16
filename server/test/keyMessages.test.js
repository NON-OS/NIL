import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Identity } from '@semaphore-protocol/identity';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import keyMessage from '../../client/src/lib/crypto/keyMessage.ts';
import privateKeysMessage from '../../client/src/lib/crypto/privateKeysMessage.ts';
import identityFromSignature from '../../client/src/lib/crypto/identityFromSignature.ts';
import privateKeysFromSignature from '../../client/src/lib/crypto/privateKeysFromSignature.ts';

const hex = (bytes) => Buffer.from(bytes).toString('hex');

let srv;
const owner = client(() => srv.base);
const ownerWallet = wallet();
let userId;

before(async () => {
  srv = await startServer();
  userId = (await owner.wallet(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NØNOS' })).data.user.id;
});
after(() => srv.close());

// What the browser does to unlock its keys: fetch the workspace key, build both messages, sign
// them with the wallet and stretch the signatures into keys. The name is handed in too, the way
// the app once did, so a message that starts using it again fails here.
async function unlock() {
  const { key, name } = (await owner('GET', '/api/proofs/key')).data;
  const docs = keyMessage({ workspace: name, workspaceKey: key, userId });
  const payoutsAndVotes = privateKeysMessage({ workspace: name, workspaceKey: key, userId });
  const keys = privateKeysFromSignature(ownerWallet.sign(payoutsAndVotes));
  return {
    messages: [docs, payoutsAndVotes],
    docsKey: hex(identityFromSignature(ownerWallet.sign(docs)).publicKey),
    spendingKey: hex(keys.spendingKey),
    viewingKey: hex(keys.viewingKey),
    votingKey: new Identity(keys.semaphoreSecret).commitment.toString(),
  };
}

test('renaming the workspace leaves the docs, payout and voting keys unchanged', async () => {
  const first = await unlock();
  assert.equal((await owner('PATCH', '/api/workspace', { name: 'Renamed Collective' })).status, 200);
  const renamed = await unlock();
  assert.deepEqual(renamed, first);
  for (const message of renamed.messages) {
    assert.ok(!message.includes('NØNOS') && !message.includes('Renamed Collective'));
  }
});

test('the messages are readable plain text, bound to one workspace key and one account', () => {
  const docs = keyMessage({ workspaceKey: 'key-one', userId: 'person-one' });
  const payoutsAndVotes = privateKeysMessage({ workspaceKey: 'key-one', userId: 'person-one' });
  assert.notEqual(docs, payoutsAndVotes);
  for (const message of [docs, payoutsAndVotes]) {
    // hardware wallets show anything outside printable ASCII as hex
    assert.match(message, /^[\x20-\x7e\n]+$/);
    assert.match(message, /It is not a transaction and costs nothing\./);
    assert.match(message, /^Workspace key: key-one$/m);
    assert.match(message, /^Account: person-one$/m);
  }
  assert.notEqual(keyMessage({ workspaceKey: 'key-two', userId: 'person-one' }), docs);
  assert.notEqual(keyMessage({ workspaceKey: 'key-one', userId: 'person-two' }), docs);
  assert.notEqual(privateKeysMessage({ workspaceKey: 'key-two', userId: 'person-one' }), payoutsAndVotes);
  assert.notEqual(privateKeysMessage({ workspaceKey: 'key-one', userId: 'person-two' }), payoutsAndVotes);
});
