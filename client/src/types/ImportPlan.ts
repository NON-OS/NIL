import type ImportItem from './ImportItem';

// What the person confirmed before importing: who each name from the other app is here, and
// where each of its projects goes.
export default interface ImportPlan {
  items: ImportItem[];
  // name in the file -> user id, or null to leave those tasks unassigned
  people: Record<string, string | null>;
  // name in the file -> an existing project, a new one with that name, or no project
  projects: Record<string, { id: string } | { create: true } | null>;
  // seal every imported task in this browser, so the server only ever holds ciphertext
  makePrivate: boolean;
}
