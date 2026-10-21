import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

let srv;
const chain = mockChain();
const owner = client(() => srv.base);

// a hosted workspace the operator hasn't marked official
before(async () => {
  srv = await startServer({ chain, env: { PUBLIC_VOTES: 'off' } });
  await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'Somebody' });
});
after(() => srv.close());

test('only an official workspace may put a vote to every NOX holder', async () => {
  const boot = (await owner('GET', '/api/bootstrap')).data;
  assert.equal(boot.nox.publicVotes, false);
  const open = await owner('POST', '/api/proposals', { title: 'Burn half the supply', options: ['Yes', 'No'], weighting: 'power', publicVote: true });
  assert.equal(open.status, 403);
  assert.match(open.data.error, /official workspace/);
  // the workspace's own votes, weighted or not, work as always
  const inside = await owner('POST', '/api/proposals', { title: 'Ship on Friday', options: ['Yes', 'No'], weighting: 'power' });
  assert.equal(inside.status, 200, JSON.stringify(inside.data));
});
