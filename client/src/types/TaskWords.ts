import type ChecklistItem from './ChecklistItem';

// The parts of a task that get encrypted when it's private.
export default interface TaskWords {
  title: string;
  description: string;
  checklist: ChecklistItem[];
}
