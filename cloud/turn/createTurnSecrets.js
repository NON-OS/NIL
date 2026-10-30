import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import states from '../provisioning/states.js';
import workspaceSecret from './workspaceSecret.js';

// coturn's table of secrets for the TURN REST API, as coturn's own schema has it
const SCHEMA = "CREATE TABLE IF NOT EXISTS turn_secret (realm varchar(127) default '', value varchar(256), primary key (realm, value))";

// Keeps the database the relay checks logins against in step with the control database: it
// holds the secret of every workspace that is up or about to be, and no other, so a workspace
// that is stopped, suspended or deleted can't use the relay, not even with passwords it handed
// out before. coturn reads the table on every login, so a change needs no restart. The relay
// reads the file as a member of the control plane's group.
export default function createTurnSecrets(ctx) {
  const { calls } = ctx.config;
  return {
    sync() {
      const wanted = new Set(
        ctx.store.workspaces
          .list()
          .filter((w) => states.routed.includes(w.state))
          .map((w) => workspaceSecret(calls.secret, w.id)),
      );
      fs.mkdirSync(path.dirname(calls.db), { recursive: true, mode: 0o770 });
      const db = new DatabaseSync(calls.db);
      try {
        db.exec('PRAGMA busy_timeout = 5000');
        db.exec(SCHEMA);
        fs.chmodSync(calls.db, 0o660);
        const have = new Set(db.prepare('SELECT value FROM turn_secret WHERE realm = ?').all(calls.host).map((r) => r.value));
        const added = [...wanted].filter((v) => !have.has(v));
        const removed = [...have].filter((v) => !wanted.has(v));
        if (!added.length && !removed.length) return { added: 0, removed: 0 };
        db.exec('BEGIN IMMEDIATE');
        try {
          const insert = db.prepare('INSERT INTO turn_secret (realm, value) VALUES (?, ?)');
          const remove = db.prepare('DELETE FROM turn_secret WHERE realm = ? AND value = ?');
          for (const value of added) insert.run(calls.host, value);
          for (const value of removed) remove.run(calls.host, value);
          db.exec('COMMIT');
        } catch (err) {
          db.exec('ROLLBACK');
          throw err;
        }
        ctx.log.info('turn.secrets_updated', { added: added.length, removed: removed.length, workspaces: wanted.size });
        return { added: added.length, removed: removed.length };
      } finally {
        db.close();
      }
    },
  };
}
