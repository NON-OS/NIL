import ask from './ask.js';
import taskContext from './taskContext.js';

export default async function describeTask(task) {
  const text = await ask({
    prompt: `Write a Markdown description for this task in this shape:

**Why** — one or two sentences on the outcome.

**What** — a short paragraph on scope.

**Done when**
- two to five checkable acceptance criteria

Stay under 160 words and keep any useful details from the current description. Reply with the Markdown only.

${taskContext(task)}`,
  });
  return text.slice(0, 8000);
}
