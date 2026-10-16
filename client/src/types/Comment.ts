export default interface Comment {
  id: string;
  taskId: string;
  authorId: string | null;
  // plain text in the browser; `sealed` says it travels encrypted under the task's key
  body: string;
  sealed?: boolean;
  // set in the browser when an encrypted comment can't be opened here
  locked?: boolean;
  createdAt: number;
  editedAt: number | null;
}
