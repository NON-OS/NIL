import storage from '../lib/storage';
import store from './store';
import keyScope from './keyScope';
import keyPins from './keyPins';

// Records this browser keeps per workspace and account only once someone has opened encrypted
// docs, private tasks or comments here (see docVersions, taskVersions, commentVersions).
const OPENED = ['doc-versions', 'task-versions', 'comment-versions'];

// Whether this browser has seen this account hold encryption keys in this workspace: its own key
// pinned, or encrypted content opened. Then a server that suddenly lists no keys and no wallet
// copies for you can't quietly move you onto a fresh identity.
export default function hadKeys() {
  const me = store.get().me?.id;
  if (!me) return false;
  if (keyPins.all()[me]) return true;
  return OPENED.some((kind) => {
    const here = keyScope.slot(kind);
    return Boolean(here) && Object.keys(storage.get<Record<string, unknown>>(here!, {})).length > 0;
  });
}
