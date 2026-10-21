import sql from '../../db/sql.js';
import secretBox from '../../agents/secretBox.js';

// The workspace's own AI provider, as an admin set it in Settings → Connect AI. The key goes in sealed and
// only `open` ever reads it back, on the server, for a request to the provider. Everything else
// gets `view`, which says that a key is set and how it ends, never the key.
const aiProvider = {
  row: () => sql.get('SELECT * FROM ai_provider WHERE id = 1') ?? null,

  view() {
    const row = aiProvider.row();
    if (!row) return null;
    return { kind: row.kind, baseUrl: row.base_url, model: row.model, keySet: Boolean(row.key_ct), keyTail: row.key_tail, updatedAt: row.updated_at };
  },

  // With `apiKey` undefined the saved key stays; null or empty removes it.
  save({ kind, baseUrl, model, apiKey }, actorId) {
    const now = Date.now();
    const current = aiProvider.row();
    const keep = apiKey === undefined && current;
    const keyCt = keep ? current.key_ct : apiKey ? secretBox.seal(apiKey) : null;
    const keyTail = keep ? current.key_tail : apiKey ? apiKey.slice(-4) : null;
    sql.run(
      `INSERT INTO ai_provider (id, kind, base_url, model, key_ct, key_tail, updated_by, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, base_url = excluded.base_url, model = excluded.model, key_ct = excluded.key_ct, key_tail = excluded.key_tail, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      kind, baseUrl ?? null, model, keyCt, keyTail, actorId, now,
    );
  },

  clear: () => sql.run('DELETE FROM ai_provider WHERE id = 1').changes > 0,

  // the key in the clear, for one request; null when none is set or it can't be read
  open(row = aiProvider.row()) {
    if (!row?.key_ct) return null;
    try {
      return secretBox.open(row.key_ct);
    } catch {
      return null;
    }
  },
};

export default aiProvider;
