import sql from '../db/sql.js';

// Who can be in a chat at all: active people on the team. Guests and agents never are; guests
// work inside their shared projects, and agents hold no key to read with. Nor is anyone a
// holder-gated workspace has locked out for not holding enough.
const chatPeople = {
  all: () => sql.all("SELECT id FROM users WHERE deactivated = 0 AND kind = 'human' AND role != 'guest' AND holder_locked_at IS NULL ORDER BY id").map((r) => r.id),

  includes: (userId) => Boolean(typeof userId === 'string' && sql.get("SELECT 1 FROM users WHERE id = ? AND deactivated = 0 AND kind = 'human' AND role != 'guest' AND holder_locked_at IS NULL", userId)),

  // the same, and with an encryption key published, so a key can be sealed to them
  withKeys: (userIds) => new Set(sql.all(`SELECT u.id FROM users u JOIN encryption_keys k ON k.user_id = u.id WHERE u.deactivated = 0 AND u.kind = 'human' AND u.role != 'guest' AND u.holder_locked_at IS NULL AND u.id IN (${userIds.map(() => '?').join(',') || 'NULL'})`, ...userIds).map((r) => r.id)),
};

export default chatPeople;
