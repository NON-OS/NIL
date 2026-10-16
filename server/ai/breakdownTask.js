import ask from './ask.js';
import taskContext from './taskContext.js';

const SCHEMA = {
  type: 'object',
  properties: { steps: { type: 'array', items: { type: 'string' } } },
  required: ['steps'],
  additionalProperties: false,
};

export default async function breakdownTask(task) {
  const out = await ask({
    schema: SCHEMA,
    prompt: `Break this task into 3 to 8 checklist steps one person can tick off in order. Start each with a verb and keep it under 90 characters. Skip anything already on the checklist.\n\n${taskContext(task)}`,
  });
  return (Array.isArray(out?.steps) ? out.steps : [])
    .map((s) => String(s).trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 12);
}
