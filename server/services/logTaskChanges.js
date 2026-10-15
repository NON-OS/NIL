import logActivity from './logActivity.js';

// One activity entry per meaningful change. Reordering isn't worth a line in the history.
export default function logTaskChanges(taskId, actorId, changes) {
  for (const { key, before, after } of changes) {
    if (key === 'position') continue;
    if (key === 'description') {
      logActivity(taskId, actorId, 'description');
    } else if (key === 'checklist') {
      const wasDone = new Set((before ?? []).filter((i) => i.done).map((i) => i.id));
      const ticked = (after ?? []).filter((i) => i.done && !wasDone.has(i.id));
      for (const item of ticked.slice(0, 3)) logActivity(taskId, actorId, 'checklist', { text: item.text });
    } else {
      logActivity(taskId, actorId, key, { from: before ?? null, to: after ?? null });
    }
  }
}
