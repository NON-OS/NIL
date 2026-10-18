import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';

// FTS5's secure-delete can leave the search index out of step with its rows. The hourly purge
// checks the index and rebuilds it from the tasks when the check fails.
let srv;
let sql;
let db;
let purge;
const base = () => srv.base;
const owner = client(base);

before(async () => {
  srv = await startServer();
  sql = (await import('../db/sql.js')).default;
  db = (await import('../db/connection.js')).default;
  purge = (await import('../jobs/purge.js')).default;
  await owner.wallet(wallet(), 'setup', { name: 'Olivia Owner', workspaceName: 'Acme' });
});
after(() => srv.close());

const titles = async (q) => (await owner('GET', `/api/search?q=${q}`)).data.tasks.map((t) => t.title).sort();
const healthy = () => {
  try {
    db.exec("INSERT INTO task_search (task_search, rank) VALUES ('integrity-check', 0)");
    return true;
  } catch {
    return false;
  }
};

test('an index that fails its check is rebuilt from the tasks, and finds the same things after', async () => {
  const a = (await owner('POST', '/api/tasks', { title: 'Renew the harbourlease' })).data.task;
  await owner('POST', `/api/tasks/${a.id}/comments`, { body: 'call the marinaoffice first' });
  const b = (await owner('POST', '/api/tasks', { title: 'Pay the harbourlease deposit' })).data.task;
  const before = { lease: await titles('harbourlease'), office: await titles('marinaoffice') };

  // what the defect leaves behind: index entries for a row whose stored size says otherwise
  sql.run('DELETE FROM task_search_docsize WHERE id = ?', b.number);
  assert.equal(healthy(), false);

  await purge();
  assert.equal(healthy(), true);
  assert.deepEqual(await titles('harbourlease'), before.lease);
  assert.deepEqual(await titles('marinaoffice'), before.office);
  assert.deepEqual(before.lease, ['Pay the harbourlease deposit', 'Renew the harbourlease']);

  // one row per team task, as the triggers keep it
  assert.equal(sql.get('SELECT COUNT(*) AS n FROM task_search').n, sql.get('SELECT COUNT(*) AS n FROM tasks WHERE private = 0 AND sealed IS NULL').n);
});

test('an index with a damaged block is rebuilt whole from the documents FTS5 keeps', async () => {
  await owner('POST', '/api/tasks', { title: 'Order the quayside banners' });
  // index blocks after the two FTS5 keeps for its own bookkeeping
  const block = sql.get('SELECT id FROM task_search_data WHERE id > 10 ORDER BY id LIMIT 1').id;
  sql.run('UPDATE task_search_data SET block = zeroblob(length(block)) WHERE id = ?', block);
  assert.equal(healthy(), false);
  await purge();
  assert.equal(healthy(), true);
  assert.deepEqual(await titles('quayside'), ['Order the quayside banners']);
  assert.deepEqual(await titles('harbourlease'), ['Pay the harbourlease deposit', 'Renew the harbourlease']);
});

test('a healthy index is left alone', async () => {
  const { default: checkSearchIndex } = await import('../db/checkSearchIndex.js');
  assert.equal(checkSearchIndex(), false);
});
