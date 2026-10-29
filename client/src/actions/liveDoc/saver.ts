import * as Y from 'yjs';
import docs from '../docs';
import docBody from '../../lib/docState/docBody';
import type LiveContext from './liveContext';
import type DocItem from '../../types/DocItem';

// a new version once typing pauses this long, and at least this often while it doesn't
const IDLE_MS = 4000;
const MAX_WAIT_MS = 20_000;
// the longest wait between tries while the server keeps refusing a version
const MAX_BACKOFF_MS = 5 * 60_000;

// Folds the live changes into a new signed version every so often, so the server can let them
// go and the doc's history has something to show. Only a tab with changes of its own saves. If
// someone saved in between, their version is laid on top first (shared state merges, nothing
// is lost) and the save goes again.
export default function createSaver(ctx: LiveContext, adopt: (saved: DocItem) => void) {
  let dirty = false;
  let since = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving: Promise<void> | null = null;
  // saves the server refused in a row
  let failures = 0;

  const schedule = (delay = Math.max(0, Math.min(IDLE_MS, since + MAX_WAIT_MS - Date.now()))) => {
    clearTimeout(timer);
    timer = setTimeout(() => void save().catch(() => {}), delay);
  };

  async function attempt() {
    for (let tries = 0; tries < 3; tries++) {
      const body = docBody.encode(Y.encodeStateAsUpdate(ctx.ydoc));
      const title = ctx.ydoc.getText('title').toString().trim().slice(0, 200) || 'Untitled';
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
      .then(() => {
        failures = 0;
        if (ctx.status.state === 'unsaved') ctx.setStatus({ state: 'saved', problem: undefined });
      })
      .catch((err) => {
        dirty = true;
        failures++;
        // the server answered and said no: say so, and try less often while it keeps saying it
        if (err?.status) ctx.setStatus({ state: 'unsaved', problem: err.message });
        schedule(Math.min(IDLE_MS * 2 ** failures, MAX_BACKOFF_MS));
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
