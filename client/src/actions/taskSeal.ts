import taskKeys, { type TaskKey } from './taskKeys';
import taskText from '../lib/crypto/taskText';
import sealedCache from '../state/sealedCache';
import type SealedTask from '../types/SealedTask';
import type TaskWords from '../types/TaskWords';

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

  async open(sealed: SealedTask): Promise<TaskWords> {
    const known = sealedCache.get(sealed);
    if (known) return known;
    const { key } = await taskKeys.open(sealed);
    const words = {
      title: await taskText.open(key, sealed.id, 'title', sealed.title),
      description: await taskText.open(key, sealed.id, 'description', sealed.description),
      checklist: JSON.parse(await taskText.open(key, sealed.id, 'checklist', sealed.checklist)),
    };
    sealedCache.remember(sealed, words);
    return words;
  },
};

export default taskSeal;
