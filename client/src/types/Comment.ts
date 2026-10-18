export default interface Comment {
  id: string;
  taskId: string;
  authorId: string | null;
  // plain text in the browser; `sealed` says it travels encrypted under the task's key
  body: string;
  sealed?: boolean;
  // set in the browser when an encrypted comment can't be opened here
  locked?: boolean;
  // set in the browser once an encrypted comment is open: its signed edit number, whether it's in
  // the older format, the fingerprint of an earlier key of the writer's that signed it, and
  // whether the server sent an older edit than one seen here, or a comment seen deleted
  edit?: number;
  olderFormat?: boolean;
  oldKey?: string | null;
  stale?: 'older' | 'deleted' | null;
  createdAt: number;
  editedAt: number | null;
}
