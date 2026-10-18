import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import db from '../db/connection.js';
import migrate from '../db/migrate.js';
import HttpError from '../lib/HttpError.js';
import parseJSON from '../lib/parseJSON.js';

const HEADER = Buffer.from('SQLite format 3\0');
const refuse = (why) => HttpError.badRequest(`That capsule can’t be restored: ${why} Nothing on this server was changed.`);

// The schema as SQLite describes it, apart from its own tables and the search index's, which
// FTS5 manages and a restore rebuilds anyway.
const OBJECTS = "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE 'task\\_search%' ESCAPE '\\'";
const objects = (conn, types) => conn.prepare(`${OBJECTS} AND type IN (SELECT value FROM json_each(?)) ORDER BY type, name`).all(JSON.stringify(types)).map((o) => JSON.stringify(o));
const shape = (conn, table) => JSON.stringify(conn.prepare('SELECT name, type, "notnull", dflt_value, pk, hidden FROM pragma_table_xinfo(?)').all(table));

function checkDatabase(file, tables) {
  const head = Buffer.alloc(HEADER.length);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, head, 0, head.length, 0);
  fs.closeSync(fd);
  if (!head.equals(HEADER)) throw refuse('what it holds isn’t a database.');

  const incoming = new DatabaseSync(file);
  try {
    let sound = false;
    try {
      sound = incoming.prepare('PRAGMA integrity_check').get().integrity_check === 'ok';
    } catch {
      // SQLite couldn't read it far enough to check it
    }
    if (!sound) throw refuse('its database is damaged.');
    // the only triggers and views it may hold are Nil's own, so nothing it brings runs here
    const ours = new Set(objects(db, ['trigger', 'view']));
    if (objects(incoming, ['trigger', 'view']).some((o) => !ours.has(o))) throw refuse('its database holds code Nil didn’t write.');
    try {
      migrate(incoming);
    } catch (err) {
      if (err.code === 'SCHEMA_TOO_NEW') throw HttpError.badRequest('That capsule comes from a newer version of Nil. Upgrade this server first, then restore it.');
      throw refuse('its database couldn’t be brought up to this version of Nil.');
    }
    // after the upgrade its tables, indexes and triggers are exactly this server's
    for (const table of tables) {
      if (shape(incoming, table) !== shape(db, table)) throw refuse(`its ${table} table isn’t the one this version of Nil uses.`);
    }
    if (JSON.stringify(objects(incoming, ['index', 'trigger', 'view'])) !== JSON.stringify(objects(db, ['index', 'trigger', 'view']))) throw refuse('its database isn’t laid out the way this version of Nil lays it out.');
    const broken = incoming.prepare('PRAGMA foreign_key_check').all().filter((r) => tables.includes(r.table));
    if (broken.length) throw refuse('some of its rows point at rows that aren’t there.');
    if (!incoming.prepare("SELECT 1 FROM workspace WHERE id = 1").get() || !incoming.prepare("SELECT 1 FROM users WHERE role = 'owner' AND deactivated = 0").get()) {
      throw refuse('it holds no workspace with an owner.');
    }
    return incoming.prepare('SELECT body FROM receipts ORDER BY seq DESC LIMIT 1').get()?.body ?? null;
  } finally {
    incoming.close();
  }
}

function checkKeys(dir, lastReceipt) {
  const signing = path.join(dir, 'keys', 'receipts-ed25519.pem');
  if (fs.existsSync(signing)) {
    let key;
    try {
      key = crypto.createPrivateKey(fs.readFileSync(signing));
    } catch {
      throw refuse('its signing key is unreadable.');
    }
    if (key.asymmetricKeyType !== 'ed25519') throw refuse('its signing key isn’t an Ed25519 key.');
    // receipts name the key that signed them, so a swapped key would leave every proof broken
    const named = lastReceipt && parseJSON(lastReceipt, null)?.workspace?.key;
    if (named && named !== crypto.createPublicKey(key).export({ format: 'jwk' }).x) throw refuse('its signing key isn’t the one its receipts were signed with.');
  } else if (lastReceipt) {
    throw refuse('it has receipts but not the key that signed them.');
  }
  const agents = path.join(dir, 'keys', 'agents-secrets.key');
  if (fs.existsSync(agents) && Buffer.from(fs.readFileSync(agents, 'utf8').trim(), 'base64').length !== 32) throw refuse('its key for agents’ secrets is malformed.');
}

// Everything a capsule is checked for before a restore writes anything: a sound database that
// upgrades to exactly this server's schema, with consistent rows, a workspace with an owner and,
// beside it, keys that are what they claim to be. `tables` are the ones the restore copies.
export default function checkCapsule(dir, tables) {
  const file = path.join(dir, 'nonos.db');
  if (!fs.existsSync(file)) throw HttpError.badRequest('That capsule has no database inside.');
  checkKeys(dir, checkDatabase(file, tables));
}
