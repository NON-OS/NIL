import http from '../api/http';
import fileSeal from './fileSeal';
import type Attachment from '../types/Attachment';
import type Task from '../types/Task';

// A file's contents as this tab can use them: fetched, and decrypted when the file is sealed.
export default async function fileBytes(task: Task, file: Attachment) {
  const blob = await http.bytes(`/attachments/${file.id}?download`);
  return file.sealed ? fileSeal.decrypt(task, file.sealed, blob) : blob;
}
