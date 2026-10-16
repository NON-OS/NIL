import saveBlob from '../lib/saveBlob';
import fileBytes from './fileBytes';
import type Attachment from '../types/Attachment';
import type Task from '../types/Task';

// Saves a file from a private task under its real name, decrypted in this tab. It's handed over
// as plain bytes, whatever its type, so the browser saves it and never tries to show it.
export default async function saveFile(task: Task, file: Attachment) {
  saveBlob(new Blob([await fileBytes(task, file)], { type: 'application/octet-stream' }), file.filename);
}
