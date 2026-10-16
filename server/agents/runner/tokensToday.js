import sql from '../../db/sql.js';

// Tokens an agent has used since local midnight, counting runs still in progress.
export default function tokensToday(agentId) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  return sql.get('SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS n FROM agent_runs WHERE agent_id = ? AND created_at >= ?', agentId, midnight.getTime()).n;
}
