// Writes server/test/fixtures/v3.0.0.db: a database exactly as release 3.0.0 left it (its 16
// migrations) with one of everything the upgrade test checks. Run once per release whose schema
// later releases must upgrade from; the file is committed, so later edits to a shipped migration
// can't quietly change what "upgrading from 3.0.0" means.
//   node --disable-warning=ExperimentalWarning scripts/upgrade-fixture.mjs
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import migrations from '../server/db/migrations.js';

const RELEASE = '3.0.0';
const SHIPPED = 16;
const out = path.resolve(`server/test/fixtures/v${RELEASE}.db`);
const at = Date.UTC(2026, 9, 15);

fs.rmSync(out, { force: true });
const db = new DatabaseSync(out);
// a single file with no -wal beside it, so the fixture is one self-contained blob in git
db.exec('PRAGMA journal_mode = DELETE');
db.exec('PRAGMA foreign_keys = ON');
// the same steps server/db/migrate.js takes, stopping where 3.0.0 stopped
for (let version = 0; version < SHIPPED; version++) {
  const step = typeof migrations[version] === 'string' ? { sql: migrations[version] } : migrations[version];
  if (step.rebuild) db.exec('PRAGMA foreign_keys = OFF');
  db.exec(step.sql);
  db.exec(`PRAGMA user_version = ${version + 1}`);
  if (step.rebuild) db.exec('PRAGMA foreign_keys = ON');
}
db.exec(`
  INSERT INTO workspace (id, name, task_prefix, task_seq, created_at) VALUES (1, 'Fixture', 'FIX', 1, ${at});
  INSERT INTO users (id, name, role, color, joined_via, created_at) VALUES ('u-owner', 'Owner', 'owner', '#5b5bd6', 'setup', ${at});
  INSERT INTO credentials (id, user_id, kind, external_id, label, created_at) VALUES ('c-owner', 'u-owner', 'wallet', '0x1111111111111111111111111111111111111111', 'Ethereum wallet', ${at});
  INSERT INTO tasks (id, number, title, creator_id, assignee_id, private, created_at, updated_at) VALUES ('t-one', 1, 'Carry this across the upgrade', 'u-owner', 'u-owner', 0, ${at}, ${at});
  INSERT INTO comments (id, task_id, author_id, body, created_at) VALUES ('m-one', 't-one', 'u-owner', 'Still here?', ${at});
  INSERT INTO notifications (user_id, type, task_id, actor_id, read_at, created_at) VALUES ('u-owner', 'comment', 't-one', 'u-owner', ${at}, ${at});
`);
db.exec('VACUUM');
db.close();
console.log(`Wrote ${path.relative(process.cwd(), out)} at schema ${SHIPPED}.`);
