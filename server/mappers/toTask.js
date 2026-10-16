import parseJSON from '../lib/parseJSON.js';
import toTaskCard from './toTaskCard.js';

// The whole task: its card plus the notes and checklist.
export default function toTask(row) {
  if (!row) return null;
  const checklist = parseJSON(row.checklist, []);
  const card = toTaskCard(row);
  return {
    ...card,
    description: row.description,
    checklist,
    steps: card.sealed ? null : { done: checklist.filter((item) => item.done).length, total: checklist.length },
  };
}
