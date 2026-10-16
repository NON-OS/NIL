// A file on a private task as the server holds it: the file's own seal id, the task seal its
// bytes and details were encrypted under, its name and type encrypted, and its own key wrapped
// under the task's current key.
export default interface SealedFile {
  id: string;
  seal: string;
  meta: string;
  key: string;
}
