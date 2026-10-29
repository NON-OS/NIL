import path from 'node:path';
import uploadDir from '../lib/uploadDir.js';

// Where an encrypted chat file sits: with the task files, under its id and a prefix of its own.
export default function chatFilePath(id) {
  return path.join(uploadDir, `chat-${id}`);
}
