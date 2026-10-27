import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import socket from '../../realtime/socket';
import docLiveCipher from '../../lib/crypto/docLiveCipher';
import cursorColor from '../../lib/docState/cursorColor';
import REMOTE from './remote';
import type LiveContext from './liveContext';

// cursor moves go out at most this often
const SEND_MS = 120;

// Who else has the doc open and where their cursor is, sealed with the doc key and passed through
// the server, which keeps none of it. Only an id and a colour are shared; names come from this
// tab's own list of teammates, so nobody can put a different name on their cursor.
export default function createPresence(ctx: LiveContext, me: string) {
  const awareness = new Awareness(ctx.ydoc);
  awareness.setLocalStateField('user', { id: me, color: cursorColor(me) });
  const changed = new Set<number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  async function send() {
    timer = undefined;
    const ids = [...changed];
    changed.clear();
    if (!ids.length) return;
    const ct = await docLiveCipher.seal(ctx.key, ctx.docId, 'aware', docLiveCipher.newId(), encodeAwarenessUpdate(awareness, ids));
    socket.docAware(ctx.docId, ct);
  }

  const queue = (id: number) => {
    changed.add(id);
    timer ??= setTimeout(() => void send().catch(() => {}), SEND_MS);
  };

  awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
    if (stopped) return;
    // someone new opened the doc: tell them where this cursor is
    if (origin === REMOTE) return added.length && queue(awareness.clientID);
    for (const id of [...added, ...updated, ...removed]) if (id === awareness.clientID) queue(id);
  });
  socket.docOpen(ctx.docId);
  queue(awareness.clientID);

  return {
    awareness,
    async receive(ct: string) {
      try {
        const { payload } = await docLiveCipher.open(ctx.key, ctx.docId, 'aware', ct);
        applyAwarenessUpdate(awareness, payload, REMOTE);
      } catch {}
    },
    stop() {
      removeAwarenessStates(awareness, [awareness.clientID], 'local');
      void send().catch(() => {});
      stopped = true;
      socket.docOpen(null);
      awareness.destroy();
    },
  };
}
