import * as Y from 'yjs';
import docs from '../docs';
import docBody from '../../lib/docState/docBody';
import type LiveContext from './liveContext';
import type DocItem from '../../types/DocItem';

// a new version once typing pauses this long, and at least this often while it doesn't
const IDLE_MS = 4000;
const MAX_WAIT_MS = 20_000;

// Folds the live changes into a new signed version every so often, so the server can let them
// go and the doc's history has something to show. Only a tab with changes of its own saves. If
// someone saved in between, their version is laid on top first (shared state merges, nothing
// is lost) and the save goes again.
export default function createSaver(ctx: LiveContext, adopt: (saved: DocItem) => void) {
  let dirty = false;
  let since = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> | null = null;

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void save().catch(() => {}), Math.max(0, Math.min(IDLE_MS, since + MAX_WAIT_MS - Date.now())));
  };

  async function attempt() {
    for (let tries = 0; tries < 3; tries++) {
      const body = docBody.encode(Y.encodeStateAsUpdate(ctx.ydoc));
      const title = ctx.ydoc.getText('title').toString().trim() || 'Untitled';
      try {
        adopt(await docs.save(ctx.doc, title, body, { through: ctx.through }));
        return;
      } catch (err: any) {
        if (err?.status !== 409) throw err;
        await ctx.reload();
      }
    }
    throw new Error('Others kept saving this doc. Your changes are still here and will be saved shortly.');
  }

  function save(): Promise<void> {
    if (saving) return saving;
    if (!dirty || ctx.status.state === 'readonly') return Promise.resolve();
    dirty = false;
    saving = attempt()
      .catch((err) => {
        dirty = true;
        schedule();
        throw err;
      })
      .finally(() => (saving = null));
    return saving;
  }

  return {
    changed() {
      if (!dirty) since = Date.now();
      dirty = true;
      schedule();
    },
    // a version is needed now, even without changes of this tab's own (the server asked for one)
    saveNow() {
      dirty = true;
      return save();
    },
    dirty: () => dirty || Boolean(saving),
    flush: save,
    stop: () => clearTimeout(timer),
  };
}
