import type SealedTask from '../types/SealedTask';
import type OpenedWords from '../types/OpenedWords';

// The plain text of sealed tasks this tab has already opened or written, by title ciphertext.
// Every seal makes a fresh ciphertext, so it pins down one version of a task's words exactly.
// A card opens to its title and checklist; the notes join the same entry once the whole task
// is opened. Memory only: gone on reload, sign-out or lock.
const words = new Map<string, OpenedWords>();

const sealedCache = {
  get: (sealed: SealedTask) => words.get(sealed.title),
  remember: (sealed: SealedTask, plain: OpenedWords) => void words.set(sealed.title, { ...words.get(sealed.title), ...plain }),
  clear: () => words.clear(),
};

export default sealedCache;
