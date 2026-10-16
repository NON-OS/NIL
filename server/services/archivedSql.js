// The SQL for an archived task: done or canceled, and untouched since `before`. Archived tasks
// stay on the server until a view asks for them. A finished task with a bounty still owed is
// never archived, because the Bounties page lists everything owed. The browser mirrors this in
// client/src/lib/isArchived.ts; change both together.
export default function archivedSql(before) {
  return {
    where: `(tasks.status IN ('done', 'canceled') AND tasks.updated_at < ? AND NOT (tasks.status = 'done' AND tasks.bounty IS NOT NULL AND tasks.bounty_state IS NOT 'paid'))`,
    params: [before],
  };
}
