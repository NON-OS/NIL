import sql from '../db/sql.js';
import config from '../config.js';
import toTask from '../mappers/toTask.js';
import rewardToken from '../lib/rewardToken.js';
import publicWorkspace from './publicWorkspace.js';

const SUMMARY = 600;

// What the world may see of a listed bounty: the task's title, a short summary, the reward
// and the deadline. Never people, projects, comments or anything not explicitly listed.
// Taken, finished or private tasks drop off the list on their own.
export default function listedBounties() {
  const ws = publicWorkspace();
  const rows = sql.all(
    "SELECT * FROM tasks WHERE listed_at IS NOT NULL AND bounty IS NOT NULL AND private = 0 AND deleted_at IS NULL AND assignee_id IS NULL AND status NOT IN ('done', 'canceled') ORDER BY listed_at DESC LIMIT 200",
  );
  return {
    format: 'nonos.bounties',
    version: 1,
    workspace: ws?.name ?? null,
    url: config.appUrl,
    chainId: config.nox.chainId,
    items: rows.map(toTask).map((t) => {
      const token = rewardToken(t.bountyToken);
      return {
        id: t.id,
        ref: `${ws.taskPrefix}-${t.number}`,
        title: t.title,
        summary: t.description.length > SUMMARY ? `${t.description.slice(0, SUMMARY).trimEnd()}…` : t.description,
        reward: { amount: t.bounty, symbol: token.symbol, decimals: token.decimals, token: token.address },
        due: t.dueDate,
        listedAt: new Date(t.listedAt).toISOString(),
        applicants: sql.get("SELECT COUNT(*) AS n FROM applications WHERE task_id = ? AND status = 'pending'", t.id).n,
        apply: config.appUrl ? `${config.appUrl}/open#${t.id}` : null,
      };
    }),
  };
}
