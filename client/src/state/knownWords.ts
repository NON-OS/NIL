import sealedCache from './sealedCache';
import taskVersions from './taskVersions';
import isRollback from '../lib/isRollback';
import type SealedTask from '../types/SealedTask';
import type OpenedWords from '../types/OpenedWords';

// The words this tab already opened for a version of a private task, checked again against the
// newest revision seen since: a version opened earlier can be older than one opened after it, and
// a server that goes back to it is still holding back newer words.
export default function knownWords(sealed: SealedTask, taskId: string): OpenedWords | undefined {
  const words = sealedCache.get(sealed);
  return words && { ...words, rollback: Boolean(words.rollback) || isRollback([words.rev], taskVersions.seen(taskId)) };
}
