import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import migrations from '../db/migrations.js';

// the latest schema, empty: query plans depend on indexes, not on rows
const db = new DatabaseSync(':memory:');
for (const step of migrations) db.exec(typeof step === 'string' ? step : step.sql);

const tables = db
  .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND sql NOT LIKE 'CREATE VIRTUAL%' AND name NOT LIKE 'task_search_%'")
  .all()
  .map((r) => r.name);
const plan = (query) => db.prepare(`EXPLAIN QUERY PLAN ${query}`).all().map((r) => r.detail);
const scans = (query) => plan(query).filter((d) => /^SCAN /.test(d) && !/VIRTUAL TABLE|json_each/.test(d));

// An index that starts with the column, usable for `column = ?`: a full one, or one that leaves
// out only the rows where the column is empty.
function indexed(table, column) {
  const keys = db.prepare('SELECT name FROM pragma_table_info(?) WHERE pk > 0 ORDER BY pk').all(table).map((r) => r.name);
  if (keys[0] === column) return true;
  return db
    .prepare('SELECT name, partial FROM pragma_index_list(?)')
    .all(table)
    .some((index) => {
      const first = db.prepare('SELECT name FROM pragma_index_info(?) WHERE seqno = 0').get(index.name)?.name;
      if (first !== column) return false;
      if (!index.partial) return true;
      const { sql } = db.prepare('SELECT sql FROM sqlite_schema WHERE name = ?').get(index.name);
      return new RegExp(`WHERE ${column} IS NOT NULL$`).test(sql.trim());
    });
}

test('every foreign key has an index, so deleting what it points at never reads the whole table', () => {
  const missing = [];
  for (const table of tables) {
    for (const fk of db.prepare('SELECT "from", "table" FROM pragma_foreign_key_list(?)').all(table)) {
      if (!indexed(table, fk.from)) missing.push(`${table}.${fk.from} -> ${fk.table}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('erasing a task, a person, a goal or a credential finds every row that points at it by index', () => {
  for (const query of ['DELETE FROM tasks WHERE id = ?', 'DELETE FROM users WHERE id = ?', 'DELETE FROM goals WHERE id = ?', 'DELETE FROM credentials WHERE id = ?', 'DELETE FROM agent_runs WHERE id = ?']) {
    assert.deepEqual(scans(query), [], query);
  }
});

// The same statements the app runs, from the files named.
const HOT = {
  'routes/bootstrap.js: unread count': 'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
  'services/archiveBoundary.js': `SELECT updated_at FROM tasks WHERE deleted_at IS NULL AND status IN ('done', 'canceled') AND updated_at >= ? AND (tasks.private = 0 OR tasks.creator_id = ? OR tasks.assignee_id = ?)
     ORDER BY updated_at DESC LIMIT 1 OFFSET ?`,
  'jobs/sendDueAlerts.js: due today': "SELECT * FROM tasks WHERE deleted_at IS NULL AND status NOT IN ('done', 'canceled') AND due_at IS NULL AND due_date BETWEEN ? AND ? AND (due_alerted IS NULL OR due_alerted <> due_date) LIMIT 2000",
  'jobs/sendDueAlerts.js: due soon': "SELECT * FROM tasks WHERE deleted_at IS NULL AND status NOT IN ('done', 'canceled') AND due_at > ? AND due_at <= ? AND (due_alerted IS NULL OR due_alerted <> CAST(due_at AS TEXT)) ORDER BY due_at LIMIT 500",
  'jobs/purge.js: finished tasks': "SELECT id FROM tasks WHERE (status = 'done' AND completed_at < ?) OR (status = 'canceled' AND updated_at < ?) LIMIT ?",
  'jobs/purge.js: trash': 'SELECT id FROM tasks WHERE deleted_at IS NOT NULL AND deleted_at < ? LIMIT ?',
  'services/sweepComments.js': 'SELECT id, task_id FROM comments WHERE created_at < ? LIMIT ?',
  'services/commentQuotes.js: swept': `UPDATE notifications SET data = json_remove(data, '$.excerpt') WHERE task_id = ? AND type IN ('mention', 'comment') AND json_extract(data, '$.excerpt') IS NOT NULL
     AND (created_at < ? OR json_extract(data, '$.commentId') NOT IN (SELECT id FROM comments WHERE task_id = ?))`,
  // what db/deleteSome.js selects for the purge and the agent data sweep
  'jobs/purge.js: sessions': 'SELECT rowid FROM sessions WHERE expires_at < ? LIMIT ?',
  'jobs/purge.js: read notifications': 'SELECT rowid FROM notifications WHERE read_at IS NOT NULL AND read_at < ? LIMIT ?',
  'jobs/purge.js: activity': 'SELECT rowid FROM activity WHERE created_at < ? LIMIT ?',
  'jobs/pruneAgentData.js: steps': 'SELECT rowid FROM agent_steps WHERE created_at < ? LIMIT ?',
  'jobs/pruneAgentData.js: summaries': 'SELECT rowid FROM agent_runs WHERE summary IS NOT NULL AND created_at < ? LIMIT ?',
  'jobs/pruneAgentData.js: audit': 'SELECT rowid FROM agent_audit WHERE created_at < ? LIMIT ?',
  'jobs/pruneAgentData.js: replies': 'SELECT rowid FROM agent_idempotency WHERE created_at < ? LIMIT ?',
  'services/uploadQuota.js': 'SELECT COALESCE(SUM(size), 0) AS n FROM attachments WHERE uploader_id = ?',
  'services/lostAccess.js: watches': 'SELECT DISTINCT task_id FROM watchers WHERE user_id = ? AND task_id IS NOT NULL',
  'services/lostAccess.js: My Day': 'SELECT DISTINCT user_id FROM focus WHERE task_id = ?',
  'services/lostAccess.js: notifications': 'SELECT DISTINCT user_id FROM notifications WHERE task_id = ?',
  'routes/goals.js': 'SELECT id FROM tasks WHERE goal_id = ?',
  'routes/publicBounties.js': "SELECT COUNT(*) AS n FROM applications WHERE address = ? AND status = 'pending'",
  'routes/firstRun.js': 'SELECT 1 FROM invites WHERE created_by = ? LIMIT 1',
};

for (const [where, query] of Object.entries(HOT)) {
  test(`${where} reads by index`, () => assert.deepEqual(scans(query), []));
}
