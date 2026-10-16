import toWorkspace from './toWorkspace.js';

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
    insert(w) {
      const at = now();
      run(
        `INSERT INTO workspaces (id, name, owner, state, image, plan, volume, setup_token, created_at, updated_at, invoice_slot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(invoice_slot), -1) + 1 FROM workspaces))`,
        w.id, w.name, w.owner, w.state, w.image, w.plan, w.volume, w.setupToken ?? null, at, at,
      );
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

  return { db, now, workspaces, events, backups, usage };
}
