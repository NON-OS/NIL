import * as Y from 'yjs';
import docs from '../docs';
import readDoc from '../readDoc';
import liveDocs from './liveDocs';
import loadState from './loadState';
import versionState from './versionState';
import createStateGuard from '../../lib/docState/createStateGuard';
import createInbox from './inbox';
import REMOTE from './remote';
import createOutbox from './outbox';
import createSaver from './saver';
import createPresence from './presence';
import createUnsent from './unsent';
import toast from '../../state/toast';
import type LiveContext from './liveContext';
import type LiveDoc from '../../types/LiveDoc';
import type LiveStatus from '../../types/LiveStatus';
import type DocItem from '../../types/DocItem';
import type EncryptedUpdate from '../../types/EncryptedUpdate';

// One doc open for live editing: its shared state, built from the newest version this tab could
// verify and the checked changes since, kept in step with everyone else's and saved as it goes.
// The key that opened the version is the only one anything is sealed with; when the doc moves
// to a new key, `onRekey` asks the editor to open it afresh.
export default async function createLiveDoc(start: DocItem, me: string, onRekey: (fresh: DocItem) => void): Promise<LiveDoc> {
  const key = readDoc.keyOf(start);
  if (!key) throw new Error('Reopen the doc to edit it.');
  const listeners = new Set<(s: LiveStatus) => void>();
  const ydoc = new Y.Doc();
  const ctx: LiveContext = {
    ydoc,
    docId: start.id,
    key,
    doc: start,
    through: start.live.through,
    sent: new Set(),
    status: { state: start.warning === 'unverified' ? 'readonly' : 'saved', refused: 0 },
    setStatus(patch) {
      ctx.status = { ...ctx.status, ...patch };
      for (const fn of listeners) fn(ctx.status);
    },
    local: () => saver.changed(),
    settled: () => void unsent.settled(),
    saveNow: () => saver.saveNow(),
    reload: async () => rebase(await docs.open(ctx.docId)),
    accepts: (update) => guard.accepts(update),
    reopen: () => onRekey(ctx.doc),
  };

  const adopt = (saved: DocItem) => {
    ctx.doc = saved;
    ctx.through = Math.max(ctx.through, saved.live.through);
  };
  // A newer version arrived: one that checks out is merged in (shared state never loses anyone's
  // changes); one that doesn't stops this tab from writing; a new key means opening afresh.
  async function rebase(fresh: DocItem) {
    if (fresh.version < ctx.doc.version) return;
    if (fresh.keyHash !== ctx.doc.keyHash) return onRekey(fresh);
    if (fresh.warning === 'unverified') return ctx.setStatus({ state: 'readonly' });
    const state = versionState.of(fresh);
    if (!guard.accepts(state)) {
      ctx.setStatus({ state: 'readonly', refused: ctx.status.refused + 1 });
      toast.show(versionState.unsafe, { tone: 'error' });
      return;
    }
    Y.applyUpdate(ydoc, state, REMOTE);
    adopt(fresh);
    // not awaited: a rebase can come from inside the inbox, which would then wait on itself
    void inbox.receive(fresh.live.updates, { more: fresh.live.more });
  }

  loadState(ydoc, start);
  const guard = createStateGuard(ydoc);
  const inbox = createInbox(ctx);
  const saver = createSaver(ctx, adopt);
  await inbox.receive(start.live.updates, { more: start.live.more });
  const outbox = createOutbox(ctx);
  const unsent = createUnsent(ctx);
  const presence = createPresence(ctx, me);
  if (ctx.status.state !== 'readonly' && (await unsent.recover())) toast.show('Changes you made here earlier that hadn’t reached the server are back in the doc and on their way.');
  const unregister = liveDocs.register(start.id, (event) => {
    if (event.type === 'doc-update') void inbox.receive([event as unknown as EncryptedUpdate]);
    else if (event.type === 'doc-aware' && typeof event.ct === 'string' && typeof event.from === 'string') void presence.receive(event.ct, event.from);
  });

  return {
    ydoc,
    awareness: presence.awareness,
    current: () => ctx.doc,
    status: () => ctx.status,
    onStatus(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    rebase,
    pending: () => outbox.pending() || saver.dirty(),
    reconnected() {
      outbox.retryNow();
      void inbox.catchUp();
    },
    async close() {
      unregister();
      presence.stop();
      // what's typed still goes out, and a version folds it in, even as the editor closes
      await outbox.flush().catch(() => {});
      outbox.stop();
      await saver.flush().catch(() => {});
      saver.stop();
      await unsent.stop();
      guard.stop();
      ydoc.destroy();
    },
  };
}
