import taskKeys, { type TaskKey } from './taskKeys';
import taskText from '../lib/crypto/taskText';
import sealedCache from '../state/sealedCache';
import type SealedTask from '../types/SealedTask';
import type TaskWords from '../types/TaskWords';
import type OpenedWords from '../types/OpenedWords';

// Encrypts a private task's words under its key, and opens them again.
const taskSeal = {
  async seal(words: TaskWords, { id, key }: TaskKey, keys: Record<string, string>): Promise<SealedTask> {
    const [title, description, checklist] = await Promise.all([
      taskText.seal(key, id, 'title', words.title),
      taskText.seal(key, id, 'description', words.description),
      taskText.seal(key, id, 'checklist', JSON.stringify(words.checklist)),
    ]);
    const sealed = { id, title, description, checklist, keys };
    sealedCache.remember(sealed, words);
    return sealed;
  },

  // A card carries no encrypted notes, so it opens to its title and checklist only. Opening
  // the whole task later adds the notes, without decrypting the rest a second time.
  async open(sealed: SealedTask): Promise<OpenedWords> {
    const known = sealedCache.get(sealed);
    if (known && (known.description !== undefined || sealed.description === undefined)) return known;
    const { key } = await taskKeys.open(sealed);
    const words: OpenedWords = {
      title: known?.title ?? (await taskText.open(key, sealed.id, 'title', sealed.title)),
      checklist: known?.checklist ?? JSON.parse(await taskText.open(key, sealed.id, 'checklist', sealed.checklist)),
    };
    if (sealed.description !== undefined) words.description = await taskText.open(key, sealed.id, 'description', sealed.description);
    sealedCache.remember(sealed, words);
    return words;
  },
};

export default taskSeal;
