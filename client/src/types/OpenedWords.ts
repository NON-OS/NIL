import type ChecklistItem from './ChecklistItem';

// What this tab has opened of a sealed task: its title and checklist from the card, and its
// notes once the whole task has been fetched.
export default interface OpenedWords {
  title: string;
  checklist: ChecklistItem[];
  description?: string;
}
