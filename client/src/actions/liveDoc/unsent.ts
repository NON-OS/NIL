import * as Y from 'yjs';
import sealedLocal from '../../lib/sealedLocal/sealedLocal';
import b64u from '../../lib/crypto/b64u';
import REMOTE from './remote';
import type LiveContext from './liveContext';

const USE = 'doc-unsent';
// how soon after a change it's put away
const WRITE_MS = 300;

// Keeps this tab's changes in the browser, encrypted (see sealedLocal), until the server holds
// them as live changes or in a version. If the tab closes or the device goes off first, the next
// time this person opens the doc here their changes are laid back in and sent.
export default function createUnsent(ctx: LiveContext) {
  const name = `${ctx.docId}:${b64u.encode(crypto.getRandomValues(new Uint8Array(9)))}`;
  let held: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing = Promise.resolve();

  const write = () => {
    timer = undefined;
    const update = held.length ? Y.mergeUpdates(held) : null;
    held = update ? [update] : [];
    writing = writing.then(() => (update ? sealedLocal.put(USE, name, update).then(() => {}) : sealedLocal.remove(USE, name)));
    return writing;
  };

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE) return;
    held.push(update);
    timer ??= setTimeout(write, WRITE_MS);
  };
  ctx.ydoc.on('update', onUpdate);

  return {
    // Lays in what earlier visits here left unsent, from any tab, as this tab's own changes so
    // they go out again. Returns whether anything new came back.
    async recover() {
      let restored = false;
      const changed = () => (restored = true);
      ctx.ydoc.on('update', changed);
      for (const other of await sealedLocal.names(USE, `${ctx.docId}:`)) {
        const update = await sealedLocal.get(USE, other);
        try {
          if (update) Y.applyUpdate(ctx.ydoc, update);
        } catch {}
        await sealedLocal.remove(USE, other);
      }
      ctx.ydoc.off('update', changed);
      return restored;
    },
    // everything this tab changed is on the server now
    settled() {
      held = [];
      clearTimeout(timer);
      return write();
    },
    stop() {
      clearTimeout(timer);
      ctx.ydoc.off('update', onUpdate);
      return held.length ? write() : writing;
    },
  };
}
