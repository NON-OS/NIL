export default function toProject(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    color: row.color,
    description: row.description,
    leadId: row.lead_id,
    archived: !!row.archived,
    position: row.position,
    createdAt: row.created_at,
  };
}
