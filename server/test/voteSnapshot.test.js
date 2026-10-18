import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import mockChain from './helpers/mockChain.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

let srv;
const chain = mockChain();
const owner = client(() => srv.base);
const ana = client(() => srv.base);
const wallets = { owner: wallet(), ana: wallet() };

before(async () => {
  srv = await startServer({ chain, env: { NOX_FINALITY_DEPTH: '10' } });
  await owner.wallet(wallets.owner, 'setup', { name: 'Erik Lind', workspaceName: 'NONOS' });
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  await ana.wallet(wallets.ana, 'invite', { name: 'Ana', inviteToken: inv.data.token });
  chain.setBalance(wallets.ana.address, 10n ** 20n);
});
after(() => srv.close());

const hashOf = async (number) => {
  const res = await fetch(process.env.NOX_RPC_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: [`0x${number.toString(16)}`, false] }) });
  return (await res.json()).result.hash;
};

// Opens a weighted vote and returns its snapshot block and every eth_call the snapshot made.
async function snapshot(title) {
  const from = chain.calls.length;
  const res = await owner('POST', '/api/proposals', { title, options: ['Yes', 'No'], weighting: 'power' });
  assert.equal(res.status, 200, res.data.error);
  const audit = (await owner('GET', `/api/proposals/${res.data.proposal.id}/audit`)).data;
  return { block: audit.power.block, reads: chain.calls.slice(from).filter((c) => c.method === 'eth_call').map((c) => c.params[1]) };
}

test('voting power is read at the finalized block, every call naming it by hash', async () => {
  chain.mine(20);
  const { block, reads } = await snapshot('Read at a final block');
  assert.equal(block, chain.head() - 2, 'the node’s finalized block, not its head');
  assert.ok(reads.length >= 6, 'NOX, stake and passes for both wallets');
  const hash = await hashOf(block);
  for (const at of reads) assert.deepEqual(at, { blockHash: hash, requireCanonical: true });
});

test('on a node without the finalized tag, the snapshot sits NOX_FINALITY_DEPTH under the head', async () => {
  chain.setFinalityLag(null);
  try {
    const { block, reads } = await snapshot('Read under a fixed depth');
    assert.equal(block, chain.head() - 10);
    const hash = await hashOf(block);
    assert.ok(reads.every((at) => at.blockHash === hash));
  } finally {
    chain.setFinalityLag(2);
  }
});
