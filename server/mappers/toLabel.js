export default function toLabel(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, color: row.color };
}
