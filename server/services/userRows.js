import sql from '../db/sql.js';

// People with their first linked wallet, which is also where bounties are paid.
const SELECT = `SELECT u.*, (SELECT c.external_id FROM credentials c WHERE c.user_id = u.id AND c.kind = 'wallet' ORDER BY c.created_at LIMIT 1) AS address FROM users u`;

const userRows = {
  select: SELECT,
  one: (id) => sql.get(`${SELECT} WHERE u.id = ?`, id),
  all: () => sql.all(`${SELECT} ORDER BY u.name COLLATE NOCASE`),
};

export default userRows;
