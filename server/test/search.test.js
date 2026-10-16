import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import startServer from './helpers/startServer.js';
import client from './helpers/client.js';
import wallet from './helpers/wallet.js';
import sealed, { cipher } from './helpers/sealed.js';

let srv;
let sql;
const base = () => srv.base;
const owner = client(base);
const member = client(base);
const guest = client(base);
const ids = {};

const find = async (c, q) => {
  const res = await c('GET', `/api/search?q=${encodeURIComponent(q)}`);
  assert.equal(res.status, 200, q);
  return res.data.tasks;
};
const titles = async (c, q) => (await find(c, q)).map((t) => t.title);
const indexed = (taskId) => Boolean(sql.get('SELECT 1 FROM task_search WHERE rowid = (SELECT number FROM tasks WHERE id = ?)', taskId));
// every word the index holds, straight from FTS5's own vocabulary
const vocabulary = () => {
  sql.run('CREATE VIRTUAL TABLE IF NOT EXISTS temp.search_words USING fts5vocab(main, task_search, row)');
  return new Set(sql.all('SELECT term FROM temp.search_words').map((r) => r.term));
};

before(async () => {
  srv = await startServer();
  ({ default: sql } = await import('../db/sql.js'));
  ids.owner = (await owner.wallet(wallet(), 'setup', { name: 'Erik Lind', workspaceName: 'Studio' })).data.user.id;
  const inv = await owner('POST', '/api/invites', { role: 'member' });
  ids.member = (await member.wallet(wallet(), 'invite', { name: 'Mia Member', inviteToken: inv.data.token })).data.user.id;
  ids.offsite = (await owner('POST', '/api/projects', { name: 'Offsite' })).data.project.id;
  ids.board = (await owner('POST', '/api/projects', { name: 'Board' })).data.project.id;
  const ginv = await owner('POST', '/api/invites', { role: 'guest', projectIds: [ids.offsite] });
  ids.guest = (await guest.wallet(wallet(), 'invite', { name: 'Gus Guest', inviteToken: ginv.data.token })).data.user.id;

  ids.venue = (await owner('POST', '/api/tasks', {
    title: 'Book the venue',
    description: 'A rooftop terrace with room for twelve. Café nearby.',
    checklist: [{ text: 'Call the caterer' }],
    projectId: ids.offsite,
  })).data.task.id;
  await member('POST', `/api/tasks/${ids.venue}/comments`, { body: 'Bring lanterns for the garden' });
  ids.terms = (await owner('POST', '/api/tasks', { title: 'Term sheet with Acme Ventures', description: 'Valuation and board seat', projectId: ids.board })).data.task.id;
});
after(() => srv.close());

test('finds team tasks by title, notes, checklist and comments, and says where', async () => {
  const [byNotes] = await find(member, 'rooftop');
  assert.equal(byNotes.id, ids.venue);
  assert.equal(byNotes.field, 'description');
  assert.match(byNotes.snippet, /rooftop terrace/);
  assert.equal((await find(member, 'cater'))[0].field, 'checklist');
  assert.equal((await find(member, 'lantern'))[0].field, 'comment');
  assert.equal((await find(member, 'venue'))[0].field, 'title');
  // every word has to match, each as the start of a word, accents or not
  assert.deepEqual(await titles(member, 'book ven'), ['Book the venue']);
  assert.deepEqual(await titles(member, 'cafe'), ['Book the venue']);
  assert.deepEqual(await titles(member, 'venue acme'), []);
});

test('guests find only what they can open', async () => {
  assert.deepEqual(await titles(guest, 'venue'), ['Book the venue']);
  assert.deepEqual(await titles(guest, 'valuation'), []);
  assert.deepEqual(await titles(guest, 'acme'), []);
});

test('private tasks never reach the index, sealed or not', async () => {
  const seal = sealed(ids.owner);
  const secret = (await owner('POST', '/api/tasks', { private: true, sealed: seal })).data.task;
  await owner('POST', `/api/tasks/${secret.id}/comments`, { body: cipher(60), sealed: true });
  assert.equal(indexed(secret.id), false);
  assert.deepEqual(await find(owner, seal.title.slice(0, 12)), []);

  // a private task from before encryption still has plain text in its row; it stays out too
  sql.run('UPDATE workspace SET task_seq = task_seq + 1 WHERE id = 1');
  const { task_seq: number } = sql.get('SELECT task_seq FROM workspace WHERE id = 1');
  sql.run("INSERT INTO tasks (id, number, title, description, private, creator_id, created_at, updated_at) VALUES ('legacy1', ?, 'Engagement ring budget', 'Diamond quote', 1, ?, 0, 0)", number, ids.owner);
  assert.equal(indexed('legacy1'), false);
  assert.deepEqual(await find(owner, 'ring'), []);
  assert.equal(vocabulary().has('diamond'), false);
});

test('a team task that turns private leaves the index completely', async () => {
  const task = (await owner('POST', '/api/tasks', { title: 'Surprise party for Ana', description: 'Balloons and confetti', projectId: ids.offsite })).data.task;
  const comment = (await member('POST', `/api/tasks/${task.id}/comments`, { body: 'Ask her sister about the playlist' })).data.comment;
  assert.deepEqual(await titles(member, 'confetti'), ['Surprise party for Ana']);

  const res = await owner('PATCH', `/api/tasks/${task.id}`, { private: true, sealed: sealed(ids.owner), comments: [{ id: comment.id, body: cipher(60) }] });
  assert.equal(res.status, 200);
  assert.equal(indexed(task.id), false);
  for (const word of ['surprise', 'confetti', 'playlist']) {
    assert.deepEqual(await find(owner, word), [], word);
    assert.equal(vocabulary().has(word), false, word);
  }
});

test('trash hides a task from search until it comes back', async () => {
  await owner('DELETE', `/api/tasks/${ids.terms}`);
  assert.deepEqual(await titles(owner, 'valuation'), []);
  await owner('POST', `/api/tasks/${ids.terms}/restore`);
  assert.deepEqual(await titles(owner, 'valuation'), ['Term sheet with Acme Ventures']);
});

test('edits and removed comments keep the index current', async () => {
  await owner('PATCH', `/api/tasks/${ids.terms}`, { description: 'Pro rata rights' });
  assert.deepEqual(await titles(owner, 'valuation'), []);
  assert.deepEqual(await titles(owner, 'rata'), ['Term sheet with Acme Ventures']);
  const c = (await owner('POST', `/api/tasks/${ids.terms}/comments`, { body: 'Lawyer reviewed the cap table' })).data.comment;
  assert.deepEqual(await titles(owner, 'lawyer'), ['Term sheet with Acme Ventures']);
  await owner('DELETE', `/api/comments/${c.id}`);
  assert.deepEqual(await titles(owner, 'lawyer'), []);
});

test('query syntax is treated as plain words', async () => {
  for (const q of ['"venue" OR *', 'title:venue', 'NEAR(venue book)', 'venue AND', '*', '""', '-venue', '^', "'; DROP TABLE tasks; --"]) {
    assert.equal((await owner('GET', `/api/search?q=${encodeURIComponent(q)}`)).status, 200, q);
  }
  assert.deepEqual(await find(owner, ''), []);
  // "book:venue" is two words here, not a column filter
  assert.deepEqual(await titles(owner, 'book:venue'), ['Book the venue']);
});
