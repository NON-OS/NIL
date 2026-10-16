// A private task as the server holds it: ciphertext it can't read, and the task's key wrapped
// once for the creator and once for the assignee, by user id.
export default interface SealedTask {
  id: string;
  title: string;
  description: string;
  checklist: string;
  keys: Record<string, string>;
}
