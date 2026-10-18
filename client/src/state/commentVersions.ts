import storage from '../lib/storage';
import keyScope from './keyScope';

// The newest edit of each comment on a private task this browser has opened and checked, and the
// comments it saw deleted, per workspace and account. Comment ids and numbers only. A server that
// later shows an earlier edit of a comment, or brings a deleted one back, is caught.
const DELETED = -1;
const slot = () => keyScope.slot('comment-versions');
const all = (here: string | null) => (here ? storage.get<Record<string, number>>(here, {}) : {});

const commentVersions = {
  seen(commentId: string): number | 'deleted' {
    const edit = all(slot())[commentId];
    return edit === DELETED ? 'deleted' : (edit ?? 0);
  },

  record(commentId: string, edit: number) {
    const here = slot();
    const known = all(here);
    const held = known[commentId];
    if (here && held !== DELETED && (held === undefined || held < edit)) storage.set(here, { ...known, [commentId]: edit });
  },

  drop(commentId: string) {
    const here = slot();
    if (here) storage.set(here, { ...all(here), [commentId]: DELETED });
  },
};

export default commentVersions;
