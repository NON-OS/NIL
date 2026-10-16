import loadTask from '../services/loadTask.js';
import canSeeTask from '../services/canSeeTask.js';
import guestScope from '../services/guestScope.js';
import guestView from '../services/guestView.js';

// One viewer's share of who is online and what they're looking at: only people the viewer may
// know about, and only tasks the viewer may open. A guest would otherwise learn every member's
// name and the ids of tasks outside their projects.
export default function presenceFor(snapshot, viewer) {
  const scope = guestScope.of(viewer.id);
  const people = scope ? guestView(viewer.id, scope).people : null;
  const seen = new Map();
  const visible = (taskId) => {
    if (!seen.has(taskId)) seen.set(taskId, canSeeTask(loadTask(taskId), viewer));
    return seen.get(taskId);
  };
  return snapshot.filter((entry) => !people || people.has(entry.userId)).map((entry) => ({ userId: entry.userId, viewing: entry.viewing.filter(visible) }));
}
