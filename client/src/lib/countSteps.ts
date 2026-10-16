import type ChecklistItem from '../types/ChecklistItem';

export default function countSteps(checklist: ChecklistItem[]) {
  return { done: checklist.filter((item) => item.done).length, total: checklist.length };
}
