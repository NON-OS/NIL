import parseJSON from '../lib/parseJSON.js';

export default function toTask(row) {
  if (!row) return null;
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    projectId: row.project_id,
    goalId: row.goal_id,
    assigneeId: row.assignee_id,
    creatorId: row.creator_id,
    dueDate: row.due_date,
    startDate: row.start_date,
    estimate: row.estimate,
    labels: parseJSON(row.labels, []),
    checklist: parseJSON(row.checklist, []),
    recurrence: row.recurrence,
    position: row.position,
    commentCount: row.comment_count,
    attachmentCount: row.attachment_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    deletedAt: row.deleted_at,
  };
}
