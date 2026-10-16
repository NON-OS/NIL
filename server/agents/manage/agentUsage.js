import sql from '../../db/sql.js';

const DAY = 86_400_000;

// Tokens, estimated cost and runs for one agent: today (since local midnight) and the last 30 days.
// The cost is null for an agent without prices, since nothing was estimated.
export default function agentUsage(agentId, { priced = true } = {}) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const sum = (since) =>
    sql.get(
      `SELECT COALESCE(SUM(input_tokens), 0) AS input, COALESCE(SUM(output_tokens), 0) AS output, COALESCE(SUM(cost), 0) AS cost, COUNT(*) AS runs,
              COALESCE(SUM(status = 'failed'), 0) AS failed
       FROM agent_runs WHERE agent_id = ? AND created_at >= ?`,
      agentId, since,
    );
  const calls = (since) => sql.get("SELECT COUNT(*) AS n FROM agent_audit WHERE agent_id = ? AND via IN ('mcp', 'rest') AND created_at >= ?", agentId, since).n;
  const withCost = (row) => (priced ? row : { ...row, cost: null });
  const today = withCost(sum(midnight.getTime()));
  const month = withCost(sum(Date.now() - 30 * DAY));
  return {
    today: { ...today, apiCalls: calls(midnight.getTime()) },
    last30Days: { ...month, apiCalls: calls(Date.now() - 30 * DAY) },
  };
}
