export default function toGoal(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    ownerId: row.owner_id,
    status: row.status,
    targetDate: row.target_date,
    metricName: row.metric_name,
    metricStart: row.metric_start,
    metricCurrent: row.metric_current,
    metricTarget: row.metric_target,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
