import factChecks from './factChecks';

export interface FileFacts {
  type: string;
  // the file's length and SHA-256 before encryption
  size: number;
  hash: string;
  at: number;
}

// What whoever attaches a file to a private task signs, from format 2 on, with the file's name
// as the signed text. Its place is the task and the file's own seal id, so the server can't move
// it to another task, and the size and hash tie the details to the very bytes uploaded.
const fileFacts = {
  kind: 'nil/task-file/v2',
  place: (taskId: string, fileId: string) => [taskId, fileId],
  list: (f: FileFacts) => [f.type, f.size, f.hash, f.at],

  parse(list: unknown[]): FileFacts {
    const [type, size, hash, at] = list;
    if (list.length !== 4 || typeof type !== 'string' || type.length > 100 || !factChecks.count(size, Number.MAX_SAFE_INTEGER) || !factChecks.hash(hash) || !factChecks.time(at)) {
      throw new Error('This file carries details Nil doesn’t accept.');
    }
    return { type, size: size as number, hash: hash as string, at: at as number };
  },
};

export default fileFacts;
