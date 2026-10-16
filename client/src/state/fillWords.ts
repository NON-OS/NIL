import store from './store';
import putTask from './putTask';
import type Task from '../types/Task';

// Brings in a whole task fetched when it was opened, without undoing an edit this tab made in
// the meantime: a newer version replaces the one held, the same version only gains its notes
// and checklist (a sealed one, its encrypted notes to open), and an older one is ignored.
export default function fillWords(full: Task) {
  const held = store.get().tasks[full.id];
  if (!held || full.updatedAt > held.updatedAt) return putTask(full);
  if (full.updatedAt < held.updatedAt || held.description !== undefined) return;
  putTask(full.sealed ? { ...held, sealed: full.sealed } : { ...held, description: full.description, checklist: full.checklist });
}
