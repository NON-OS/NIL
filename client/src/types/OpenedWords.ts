import type ChecklistItem from './ChecklistItem';
import type { TaskReaders } from '../lib/crypto/taskFacts';

// What this tab has opened of a sealed task: its title and checklist from the card, and its
// notes once the whole task has been fetched.
export default interface OpenedWords {
  title: string;
  checklist: ChecklistItem[];
  description?: string;
  // the revision these words were sealed as, and whether it's older than one seen before
  rev: number;
  rollback?: boolean;
  // who signed them, and from format 2 on who they were sealed for, the hash of the task key
  // they were signed under and when; null for words in the older format, which can't say
  by: string;
  readers: TaskReaders | null;
  // the assignee who handed the task on and made its key, while nobody else has saved it since
  from: string | null;
  key: string | null;
  at: number | null;
  // the fingerprint of an earlier key of the writer's that signed them, if it wasn't their current one
  oldKey: string | null;
}
