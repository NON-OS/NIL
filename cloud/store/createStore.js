import toWorkspace from './toWorkspace.js';

const toRequest = (row) => (row ? { id: row.id, name: row.name, owner: row.owner, setupToken: row.setup_token, requestedAt: row.requested_at } : null);

const COLUMNS = {
  owner: 'owner',
  image: 'image',
  plan: 'plan',
  volume: 'volume',
  setupToken: 'setup_token',
  claimedAt: 'claimed_at',
  checkpointImage: 'checkpoint_image',
  checkpointAt: 'checkpoint_at',
  suspendedAt: 'suspended_at',
  suspendReason: 'suspend_reason',
  deleteAfter: 'delete_after',
  deletedAt: 'deleted_at',
  lastHealthyAt: 'last_healthy_at',
  activeAt: 'active_at',
};

function assignments(fields) {
  const keys = Object.keys(fields);
  for (const key of keys) if (!COLUMNS[key]) throw new Error(`Unknown workspace field: ${key}`);
  return { sql: keys.map((k) => `, ${COLUMNS[k]} = ?`).join(''), values: keys.map((k) => fields[k] ?? null) };
}

// Every query the control plane runs. Kept in one place so it's easy to see that none of them
// touch anything from inside a workspace.
export default function createStore(db, now = () => Date.now()) {
  const statements = new Map();
  const prepared = (text) => {
    let stmt = statements.get(text);
    if (!stmt) statements.set(text, (stmt = db.prepare(text)));
    return stmt;
  };
  const get = (text, ...params) => prepared(text).get(...params);
  const all = (text, ...params) => prepared(text).all(...params);
  const run = (text, ...params) => prepared(text).run(...params);

  const workspaces = {
    // The slot comes from a counter that only goes up, in the same transaction, so a slot is
    // never handed out twice, not even after its workspace's row is forgotten.
    insert(w) {
      const at = now();
      db.exec('BEGIN IMMEDIATE');
      try {
        const { slot } = get("UPDATE counters SET value = value + 1 WHERE name = 'invoice_slot' RETURNING value - 1 AS slot");
        run(
          `INSERT INTO workspaces (id, name, owner, state, image, plan, volume, setup_token, created_at, updated_at, invoice_slot)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          w.id, w.name, w.owner, w.state, w.image, w.plan, w.volume, w.setupToken ?? null, at, at, slot,
        );
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return workspaces.get(w.id);
    },

    get: (id) => toWorkspace(get('SELECT * FROM workspaces WHERE id = ?', id)),
    byName: (name) => toWorkspace(get("SELECT * FROM workspaces WHERE name = ? AND state != 'deleted'", name)),

    list({ states } = {}) {
      const rows = states
        ? all(`SELECT * FROM workspaces WHERE state IN (${states.map(() => '?').join(', ')}) ORDER BY created_at`, ...states)
        : all("SELECT * FROM workspaces WHERE state != 'deleted' ORDER BY created_at");
      return rows.map(toWorkspace);
    },

    countLive: () => get("SELECT COUNT(*) AS n FROM workspaces WHERE state != 'deleted'").n,
    countByOwner: (owner) => get("SELECT COUNT(*) AS n FROM workspaces WHERE owner = ? AND state != 'deleted'", owner).n,
    countByOwnerSince: (owner, since) => get('SELECT COUNT(*) AS n FROM workspaces WHERE owner = ? AND created_at >= ?', owner, since).n,
    // created since then, deleted ones included, so deleting doesn't refill the day's budget
    countCreatedSince: (since) => get('SELECT COUNT(*) AS n FROM workspaces WHERE created_at >= ?', since).n,

    // 'live' while a workspace uses the name, 'quarantined' for a while after one was deleted
    nameStatus(name, quarantineSince) {
      if (get("SELECT 1 FROM workspaces WHERE name = ? AND state != 'deleted'", name)) return 'live';
      if (get("SELECT 1 FROM workspaces WHERE name = ? AND state = 'deleted' AND deleted_at >= ?", name, quarantineSince)) return 'quarantined';
      return null;
    },

    update(id, fields) {
      const { sql, values } = assignments(fields);
      run(`UPDATE workspaces SET updated_at = ?${sql} WHERE id = ?`, now(), ...values, id);
      return workspaces.get(id);
    },

    // Compare-and-set: moves the workspace only if it is still in one of the `from` states, so
    // the server's background jobs and an operator's CLI command never act on it at once.
    transition(id, from, to, fields = {}) {
      const { sql, values } = assignments(fields);
      const result = run(
        `UPDATE workspaces SET state = ?, updated_at = ?${sql} WHERE id = ? AND state IN (${from.map(() => '?').join(', ')})`,
        to, now(), ...values, id, ...from,
      );
      return result.changes === 1;
    },

    // names stop being held once their quarantine is over; the owner was already cleared
    forgetDeleted: (before) => run("DELETE FROM workspaces WHERE state = 'deleted' AND deleted_at < ?", before).changes,
    // a deleted workspace that never held data releases its name at once
    forget: (id) => run("DELETE FROM workspaces WHERE id = ? AND state = 'deleted'", id).changes,
  };

  const events = {
    add: (workspaceId, kind, detail = null) => run('INSERT INTO events (workspace_id, at, kind, detail) VALUES (?, ?, ?, ?)', workspaceId, now(), kind, detail),
    recent: (workspaceId, limit = 20) => all('SELECT at, kind, detail FROM events WHERE workspace_id = ? ORDER BY id DESC LIMIT ?', workspaceId, limit),
    lastAt: (workspaceId, kind) => get('SELECT MAX(at) AS at FROM events WHERE workspace_id = ? AND kind = ?', workspaceId, kind).at ?? null,
  };

  const backups = {
    add: ({ workspaceId, kind, location, bytes }) => run('INSERT INTO backups (workspace_id, kind, location, bytes, at) VALUES (?, ?, ?, ?, ?)', workspaceId, kind, location, bytes, now()),
    latest: (workspaceId) => get('SELECT kind, location, bytes, at FROM backups WHERE workspace_id IS ? ORDER BY id DESC LIMIT 1', workspaceId),
    list: (workspaceId, limit = 20) => all('SELECT kind, location, bytes, at FROM backups WHERE workspace_id IS ? ORDER BY id DESC LIMIT ?', workspaceId, limit),
  };

  const usage = {
    set: (workspaceId, { diskBytes = null, members = null }) =>
      run(
        `INSERT INTO usage (workspace_id, disk_bytes, members, measured_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (workspace_id) DO UPDATE SET disk_bytes = excluded.disk_bytes, members = COALESCE(excluded.members, usage.members), measured_at = excluded.measured_at`,
        workspaceId, diskBytes, members, now(),
      ),
    all: () => new Map(all('SELECT workspace_id, disk_bytes, members, measured_at FROM usage').map((r) => [r.workspace_id, { diskBytes: r.disk_bytes, members: r.members, measuredAt: r.measured_at }])),
  };

  const requests = {
    add: ({ id, name, owner, setupToken }) => run('INSERT INTO signup_requests (id, name, owner, setup_token, requested_at) VALUES (?, ?, ?, ?, ?)', id, name, owner, setupToken, now()),
    list: () => all('SELECT id, name, owner, setup_token, requested_at FROM signup_requests ORDER BY requested_at').map(toRequest),
    byName: (name) => toRequest(get('SELECT id, name, owner, setup_token, requested_at FROM signup_requests WHERE name = ?', name)),
    countByOwner: (owner) => get('SELECT COUNT(*) AS n FROM signup_requests WHERE owner = ?', owner).n,
    remove: (id) => run('DELETE FROM signup_requests WHERE id = ?', id).changes,
    expire: (before) => run('DELETE FROM signup_requests WHERE requested_at < ?', before).changes,
  };

  const locks = {
    // Takes the lock when it is free, its lease has run out, or this holder has it already (a
    // renewal). True when the lock is now this holder's.
    take: (workspaceId, holder, operation, expiresAt) =>
      run(
        `INSERT INTO locks (workspace_id, holder, operation, expires_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (workspace_id) DO UPDATE SET holder = excluded.holder, operation = excluded.operation, expires_at = excluded.expires_at
         WHERE locks.expires_at <= ? OR locks.holder = excluded.holder`,
        workspaceId, holder, operation, expiresAt, now(),
      ).changes === 1,
    get(workspaceId) {
      const row = get('SELECT holder, operation, expires_at FROM locks WHERE workspace_id = ?', workspaceId);
      return row ? { holder: row.holder, operation: row.operation, expiresAt: row.expires_at } : null;
    },
    release: (workspaceId, holder) => run('DELETE FROM locks WHERE workspace_id = ? AND holder = ?', workspaceId, holder).changes,
  };

  return { db, now, workspaces, events, backups, usage, requests, locks };
}
