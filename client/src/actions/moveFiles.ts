import http from '../api/http';
import fileSeal from './fileSeal';
import fileBytes from './fileBytes';
import discardStaged from './discardStaged';
import type { TaskKey } from './taskKeys';
import type Attachment from '../types/Attachment';
import type Task from '../types/Task';

const LOCKED = 'A file on this task can’t be opened here, so the task can’t change who can read it.';

// Uploads a file's replacement, which the server swaps in only when the task itself changes.
const stage = (file: Attachment, bytes: Uint8Array) => http.put(`/attachments/${file.id}/content`, new Blob([bytes]));

async function move(task: Task, file: Attachment, to: TaskKey | null): Promise<Record<string, unknown>> {
  if (file.sealed && to) {
    const key = await fileSeal.rewrap(task, file.sealed, to).catch(() => {
      throw new Error(LOCKED);
    });
    return { id: file.id, key };
  }
  if (to) {
    const { sealed, body } = await fileSeal.seal(to, task.id, await fileBytes(task, file), file.filename, file.mime);
    await stage(file, body);
    return { id: file.id, sealed };
  }
  if (!file.sealed) return { id: file.id };
  const opened = await fileSeal.open(task, file);
  if (opened.locked) throw new Error(LOCKED);
  await stage(file, await fileBytes(task, file));
  return { id: file.id, filename: opened.filename, mime: opened.mime };
}

// Every file on the task, moved along with it to `to`, or back to plain when that's null. A
// fresh key only re-wraps each file's own key. Sealing or opening up uploads a replacement for
// each file first, encrypted or plain, one at a time so large files don't pile up in memory. If
// this stops part way, the replacements already uploaded are thrown away.
export default async function moveFiles(task: Task, files: Attachment[], to: TaskKey | null) {
  const moved = [];
  try {
    for (const file of files) moved.push(await move(task, file, to));
  } catch (err) {
    await discardStaged(task.id);
    throw err;
  }
  return moved;
}
