import sql from '../db/sql.js';

// The people who take a paid seat: active members, admins and owners. Guests don't, and neither
// do agents, which work for the team rather than in it. Billing counts seats with this alone.
export default function seatHolders() {
  return sql.get("SELECT COUNT(*) AS n FROM users WHERE deactivated = 0 AND role != 'guest' AND kind != 'agent'").n;
}
