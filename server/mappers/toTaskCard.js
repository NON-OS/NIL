import parseJSON from '../lib/parseJSON.js';
import config from '../config.js';

// A task as boards, lists and calendars show it: everything but its notes and checklist, which
// only the open task needs. `steps` counts the checklist for the card's progress bar; a sealed
// task's checklist is ciphertext, so the browser counts its steps once it opens it.
export default function toTaskCard(row) {
  if (!row) return null;
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    status: row.status,
    priority: row.priority,
    projectId: row.project_id,
    goalId: row.goal_id,
    assigneeId: row.assignee_id,
    creatorId: row.creator_id,
    dueDate: row.due_date,
    // the due moment in UTC when the task has a time, else null
    dueAt: row.due_at ?? null,
    startDate: row.start_date,
    estimate: row.estimate,
    labels: parseJSON(row.labels, []),
    steps: row.sealed ? null : { done: row.steps_done ?? 0, total: row.steps_total ?? 0 },
    recurrence: row.recurrence,
    bounty: row.bounty,
    bountyToken: row.bounty ? row.bounty_token || config.nox.symbol : null,
    bountyState: row.bounty_state,
    private: Boolean(row.private),
    // encrypted title and checklist with the key wrapped per reader, plus the encrypted notes
    // on the whole task; null for plain tasks
    sealed: parseJSON(row.sealed, null),
    listedAt: row.listed_at ?? null,
    position: row.position,
    commentCount: row.comment_count,
    attachmentCount: row.attachment_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at,
  };
}
