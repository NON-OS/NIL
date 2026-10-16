import type Status from './Status';
import type Priority from './Priority';
import type Recurrence from './Recurrence';

// One task read from another app's export, before it's matched to this workspace. People,
// projects and labels are still the names the other app used.
export default interface ImportItem {
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  dueDate: string | null;
  recurrence: Recurrence | null;
  person: string | null;
  project: string | null;
  labels: string[];
  checklist: { text: string; done: boolean }[];
  comments: { author: string | null; date: string | null; text: string }[];
}
