import * as Y from 'yjs';
import http from '../../api/http';
import docUpdateSeal from '../docUpdateSeal';
import REMOTE from './remote';
import type LiveContext from './liveContext';

// changes made within this long go out together
const BATCH_MS = 150;
// bigger than this and a change goes out as a new version instead; one live change is capped
const MAX_LIVE_BYTES = 256_000;
const MAX_RETRY_MS = 30_000;

// Sends this tab's changes as they happen: merged for a moment, signed, sealed with the doc key
// and posted. Changes the server didn't take wait here and go again; the browser also keeps them
// encrypted (see unsent) in case the tab closes first.
export default function createOutbox(ctx: LiveContext) {
  let queue: Uint8Array[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sending = false;
  let retry = 1000;
  let stopped = false;

  const schedule = (delay = BATCH_MS) => {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(send, delay);
  };

  async function post(update: Uint8Array) {
    if (update.length > MAX_LIVE_BYTES) return ctx.saveNow();
    const { id, ct } = await docUpdateSeal.seal(ctx.docId, ctx.key, update);
    ctx.sent.add(id);
    try {
      await http.post(`/docs/${ctx.docId}/updates`, { updateCt: ct });
    } catch (err) {
      ctx.sent.delete(id);
      throw err;
    }
  }

  async function send() {
    if (sending || !queue.length || ctx.status.state === 'readonly') return;
    sending = true;
    const update = Y.mergeUpdates(queue);
    queue = [];
    try {
      await post(update);
      retry = 1000;
      ctx.setStatus({ state: queue.length ? 'sending' : 'saved' });
      if (!queue.length) ctx.settled();
    } catch (err: any) {
      queue.unshift(update);
      if (err?.status === 409 || err?.status === 400) {
        // the doc wants a new version first, or the change is too big to go live: a version carries it
        await ctx.saveNow().then(
          () => {
            queue = [];
            ctx.settled();
          },
          () => ctx.setStatus({ state: 'offline' }),
        );
      } else {
        ctx.setStatus({ state: 'offline' });
        retry = Math.min(retry * 2, MAX_RETRY_MS);
      }
    } finally {
      sending = false;
      if (queue.length) schedule(ctx.status.state === 'offline' ? retry : BATCH_MS);
    }
  }

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === REMOTE || stopped) return;
    queue.push(update);
    if (ctx.status.state === 'saved') ctx.setStatus({ state: 'sending' });
    ctx.local();
    schedule();
  };
  ctx.ydoc.on('update', onUpdate);

  return {
    pending: () => sending || queue.length > 0,
    flush: send,
    // after reconnecting, try straight away instead of at the end of the back-off
    retryNow: () => queue.length && schedule(0),
    stop() {
      stopped = true;
      clearTimeout(timer);
      ctx.ydoc.off('update', onUpdate);
    },
  };
}
