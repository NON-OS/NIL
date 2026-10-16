import sql from '../db/sql.js';
import ask from './ask.js';

const PRIORITY = ['none', 'low', 'medium', 'high', 'urgent'];

const SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: PRIORITY },
          dueDate: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] },
          assignee: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
        required: ['title', 'description', 'priority', 'dueDate', 'assignee'],
        additionalProperties: false,
      },
    },
  },
  required: ['tasks'],
  additionalProperties: false,
};

// Turns meeting notes or a brain dump into draft tasks. Nothing is saved here;
// the person reviews the drafts and picks which ones to create.
export default async function extractTasks(notes, today) {
  const people = sql.all('SELECT id, name FROM users WHERE deactivated = 0');
  const out = await ask({
    schema: SCHEMA,
    prompt: `Pull every actionable task out of the notes below. Today is ${today}.
- title: imperative, under 90 characters
- description: one or two sentences of context from the notes, or ""
- priority: none, low, medium, high or urgent; only high/urgent when the notes say so
- dueDate: YYYY-MM-DD when the notes give or imply a date (resolve "Friday" against today), else null
- assignee: an exact name from this list when the notes clearly hand it to them, else null: ${people.map((p) => p.name).join(', ') || '(none)'}
Skip pure information that isn't an action.

<notes>
${notes}
</notes>`,
  });

  return (Array.isArray(out?.tasks) ? out.tasks : []).slice(0, 50).flatMap((t) => {
    const title = String(t.title ?? '').trim().slice(0, 300);
    if (!title) return [];
    const match = t.assignee && people.find((p) => p.name.toLowerCase() === String(t.assignee).toLowerCase());
    return [{
      title,
      description: String(t.description ?? '').slice(0, 4000),
      priority: Math.max(0, PRIORITY.indexOf(t.priority)),
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate ?? '') ? t.dueDate : null,
      assigneeId: match ? match.id : null,
    }];
  });
}
