import http from '../api/http';
import taskSeal from './taskSeal';
import fileSeal from './fileSeal';
import type Attachment from '../types/Attachment';
import type Task from '../types/Task';

// Uploads a file to a task. On a private task it's encrypted here first, name and type
// included and signed, under the key the task's words checked out with, and the server stores
// ciphertext under a name that says nothing; this tab opens what came back, so it goes on
// showing the real name.
export default async function uploadFile(task: Task, file: File): Promise<Attachment> {
  const url = `/tasks/${task.id}/attachments`;
  if (!task.sealed) return (await http.upload<{ attachment: Attachment }>(url, file)).attachment;
  const key = await taskSeal.key({ ...task, sealed: task.sealed });
  const { sealed, body } = await fileSeal.seal(key, task.id, new Uint8Array(await file.arrayBuffer()), file.name, file.type);
  const { attachment } = await http.send<{ attachment: Attachment }>(url, new Blob([body]), { 'X-Sealed': JSON.stringify(sealed) });
  return fileSeal.open(task, attachment);
}
