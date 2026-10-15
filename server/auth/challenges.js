import crypto from 'node:crypto';

const TTL_MS = 5 * 60_000;
const MAX_PENDING = 5000;
const pending = new Map();

function prune(now) {
  for (const [id, c] of pending) if (c.expires < now) pending.delete(id);
  // Maps keep insertion order, so the first keys are the oldest
  while (pending.size >= MAX_PENDING) pending.delete(pending.keys().next().value);
}

// Single-use, short-lived challenges for wallet signatures and votes.
const challenges = {
  issue(purpose, data = {}) {
    const now = Date.now();
    prune(now);
    const id = crypto.randomBytes(18).toString('base64url');
    pending.set(id, { purpose, data, expires: now + TTL_MS });
    return id;
  },

  take(id, purpose) {
    const c = typeof id === 'string' ? pending.get(id) : undefined;
    if (c) pending.delete(id);
    if (!c || c.purpose !== purpose || c.expires < Date.now()) return null;
    return c.data;
  },
};

export default challenges;
