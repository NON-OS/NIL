import storage from '../lib/storage';
import store from './store';

// The newest edit of each comment on a private task this browser has opened and checked, and the
// comments it saw deleted, per workspace and account. Comment ids and numbers only. A server that
// later shows an earlier edit of a comment, or brings a deleted one back, is caught.
const DELETED = -1;
const slot = () => {
  const s = store.get();
  return `comment-versions:${s.workspaceKey}:${s.me?.id ?? ''}`;
};
const all = () => storage.get<Record<string, number>>(slot(), {});

const commentVersions = {
  seen(commentId: string): number | 'deleted' {
    const edit = all()[commentId];
    return edit === DELETED ? 'deleted' : (edit ?? 0);
  },

  record(commentId: string, edit: number) {
    const known = all();
    const held = known[commentId];
    if (held !== DELETED && (held === undefined || held < edit)) storage.set(slot(), { ...known, [commentId]: edit });
  },

  drop(commentId: string) {
    storage.set(slot(), { ...all(), [commentId]: DELETED });
  },
};

export default commentVersions;
