export default function toComment(row) {
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    authorId: row.author_id,
    body: row.body,
    // the body is ciphertext under the task's key when the task is sealed
    sealed: Boolean(row.sealed),
    createdAt: row.created_at,
    editedAt: row.edited_at,
  };
}
