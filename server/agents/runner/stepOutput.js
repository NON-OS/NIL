import tools from '../../mcp/tools.js';

const reads = new Set(tools.filter((t) => !t.write).map((t) => t.name));
const TASK_KEY = /^[A-Za-z0-9]+-\d+$/;
const COUNTED = [['tasks', 'task'], ['items', 'notification'], ['comments', 'comment']];
const KEPT = 'Only this summary is kept in the log; the agent got the whole answer.';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Task keys an answer names, wherever they sit in it.
function taskKeys(value, found = new Set()) {
  if (Array.isArray(value)) for (const item of value) taskKeys(item, found);
  else if (value && typeof value === 'object') {
    for (const [field, inner] of Object.entries(value)) {
      if ((field === 'key' || field === 'task') && typeof inner === 'string' && TASK_KEY.test(inner)) found.add(inner);
      else taskKeys(inner, found);
    }
  }
  return found;
}

// What the run log keeps of a tool's answer. A read can quote any task the agent may see, and the
// log is kept for as long as the task it ran on, so when one of those tasks later turns private
// or is erased its words would stay behind in other runs' logs. Reads that bring back tasks keep
// only which tasks and how many; everything else keeps the answer the model was given.
export default function stepOutput(name, out, text) {
  if (!out.ok || !reads.has(name)) return text;
  const keys = [...taskKeys(out.data)];
  const counts = COUNTED.filter(([field]) => Array.isArray(out.data?.[field])).map(([field, word]) => plural(out.data[field].length, word));
  if (!keys.length && !counts.length) return text;
  const summary = keys.length ? `${keys.join(', ')}${counts.length ? ` (${counts.join(', ')})` : ''}` : counts.join(', ');
  return `${summary}\n${KEPT}`;
}
