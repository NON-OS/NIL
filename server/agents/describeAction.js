const LABELS = {
  status: 'status',
  priority: 'priority',
  dueDate: 'due date',
  assignee: 'assignee',
  project: 'project',
  title: 'title',
  description: 'description',
  labelsAdd: 'add labels',
  labelsRemove: 'remove labels',
  checklistAdd: 'add checklist items',
  checklistTick: 'tick',
  checklistUntick: 'untick',
  checklistRemove: 'remove checklist items',
  text: 'comment',
  goal: 'goal',
  labels: 'labels',
  checklist: 'checklist',
};

const show = (value) => {
  if (Array.isArray(value)) return value.map(show).join(', ');
  if (value === '' || value === null) return 'none';
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
};

// One line a person can read on an approval card: what the agent asked to do, in plain words.
export default function describeAction(tool, input = {}) {
  const fields = Object.entries(input)
    .filter(([key]) => key !== 'key')
    .map(([key, value]) => `${LABELS[key] ?? key}: ${show(value)}`);
  switch (tool) {
    case 'delete_task':
      return `Delete ${input.key}`;
    case 'create_task':
      return `Create “${show(input.title)}”${fields.length > 1 ? ` (${fields.filter((f) => !f.startsWith('title')).join('; ')})` : ''}`;
    case 'update_task':
      return `Change ${input.key}: ${fields.join('; ') || 'nothing'}`;
    case 'claim_task':
      return `Claim ${input.key}`;
    case 'add_comment':
      return `Comment on ${input.key}`;
    default:
      return `${tool}${fields.length ? ` (${fields.join('; ')})` : ''}`;
  }
}
