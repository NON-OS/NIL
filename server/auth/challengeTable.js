import crypto from 'node:crypto';

// Single-use, short-lived challenges, bounded twice so nobody can crowd out other people's
// sign-ins: each client holds at most `perClient` (asking again drops its own oldest), and the
// whole table at most `max` (the oldest anywhere goes first). Filling it takes `max / perClient`
// different clients, and the per-IP rate limit slows each of them down.
export default function challengeTable({ ttlMs, max, perClient }) {
  const pending = new Map();
  const byClient = new Map();

  function drop(id) {
    const c = pending.get(id);
    if (!c) return;
    pending.delete(id);
    const mine = byClient.get(c.client);
    mine?.delete(id);
    if (mine && !mine.size) byClient.delete(c.client);
  }

  // every challenge lives equally long, so the expired ones are always the oldest, at the front
  function prune(now) {
    for (const [id, c] of pending) {
      if (c.expires >= now) break;
      drop(id);
    }
    while (pending.size >= max) drop(pending.keys().next().value);
  }

  return {
    issue(purpose, data, client) {
      const now = Date.now();
      prune(now);
      const mine = byClient.get(client) ?? new Set();
      while (mine.size >= perClient) {
        const oldest = mine.values().next().value;
        drop(oldest);
        mine.delete(oldest);
      }
      const id = crypto.randomBytes(18).toString('base64url');
      pending.set(id, { purpose, data, client, expires: now + ttlMs });
      mine.add(id);
      byClient.set(client, mine);
      return id;
    },

    take(id, purpose) {
      const c = typeof id === 'string' ? pending.get(id) : undefined;
      if (c) drop(id);
      if (!c || c.purpose !== purpose || c.expires < Date.now()) return null;
      return c.data;
    },

    get size() {
      return pending.size;
    },
  };
}
