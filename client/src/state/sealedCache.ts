import type SealedTask from '../types/SealedTask';
import type TaskWords from '../types/TaskWords';

// The plain text of sealed tasks this tab has already opened or written, by title ciphertext.
// Every seal makes a fresh ciphertext, so it pins down one version of a task's words exactly.
// Memory only: gone on reload, sign-out or lock.
const words = new Map<string, TaskWords>();

const sealedCache = {
  get: (sealed: SealedTask) => words.get(sealed.title),
  remember: (sealed: SealedTask, plain: TaskWords) => void words.set(sealed.title, plain),
  clear: () => words.clear(),
};

export default sealedCache;
