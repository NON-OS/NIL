import HttpError from '../lib/HttpError.js';

// Finds a checklist item by the id get_task returned, or failing that by its exact text.
function find(list, ref) {
  const key = String(ref).trim();
  const item = list.find((i) => i.id === key) ?? list.find((i) => i.text.trim().toLowerCase() === key.toLowerCase());
  if (!item) throw HttpError.badRequest(`There’s no checklist item “${ref}” on this task. Use the ids from get_task.`);
  return item;
}

// Applies add / tick / untick / remove to a task's checklist and returns the new list, or null
// when nothing was asked of the checklist.
export default function checklistOps(current, { add = [], tick = [], untick = [], remove = [] }) {
  if (!add.length && !tick.length && !untick.length && !remove.length) return null;
  let list = current.map((i) => ({ ...i }));
  for (const ref of tick) find(list, ref).done = true;
  for (const ref of untick) find(list, ref).done = false;
  const dropped = new Set(remove.map((ref) => find(list, ref).id));
  list = list.filter((i) => !dropped.has(i.id));
  return [...list, ...add.map((text) => ({ text, done: false }))];
}
