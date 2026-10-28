import * as Y from 'yjs';
import http from '../../api/http';
import docUpdateSeal from '../docUpdateSeal';
import REMOTE from './remote';
import type LiveContext from './liveContext';
import type EncryptedUpdate from '../../types/EncryptedUpdate';

// Takes in other people's changes in the order the server numbered them. A change is applied
// only once it opens with the doc key and its author's signature checks out; anything else is
// counted and left out. A gap in the numbers means a change went missing on the way, so the
// missing ones are fetched, as are big changes the server announces without sending, and long
// backlogs it hands over a page at a time; if a newer version already covers them, the doc is
// reloaded.
export default function createInbox(ctx: LiveContext) {
  const waiting = new Map<number, EncryptedUpdate>();
  let chain = Promise.resolve();
  let filling = false;

  async function applyOne(u: EncryptedUpdate) {
    try {
      const opened = await docUpdateSeal.open(ctx.docId, ctx.key, u.updateCt ?? '', ctx.doc.readers);
      // this tab's own change, back from the server: already in the state
      if (ctx.sent.delete(opened.id)) return;
      if (opened.verified) Y.applyUpdate(ctx.ydoc, opened.update, REMOTE);
      else ctx.setStatus({ refused: ctx.status.refused + 1 });
    } catch {
      ctx.setStatus({ refused: ctx.status.refused + 1 });
    }
  }

  async function drain() {
    for (const seq of [...waiting.keys()]) if (seq <= ctx.through) waiting.delete(seq);
    while (waiting.has(ctx.through + 1)) {
      const u = waiting.get(ctx.through + 1)!;
      waiting.delete(u.seq);
      await applyOne(u);
      ctx.through = u.seq;
    }
    if (waiting.size && !filling) await fill();
  }

  async function fill() {
    filling = true;
    try {
      let more = true;
      while (more) {
        const res = await http.get<{ updates: EncryptedUpdate[]; more?: boolean }>(`/docs/${ctx.docId}/updates?after=${ctx.through}`);
        for (const u of res.updates) if (u.seq > ctx.through && u.updateCt) waiting.set(u.seq, u);
        await drain();
        more = res.more === true && res.updates.length > 0;
      }
    } catch (err: any) {
      if (err?.status === 409) await ctx.reload();
    } finally {
      filling = false;
    }
  }

  return {
    // `more` says the server has further changes after these, to be fetched
    receive(updates: EncryptedUpdate[], { more = false } = {}) {
      let fetch = more;
      for (const u of updates) {
        if (u.seq <= ctx.through) continue;
        if (u.updateCt) waiting.set(u.seq, u);
        else fetch = true;
      }
      chain = chain.then(drain, drain).then(() => (fetch && !filling ? fill() : undefined));
      return chain;
    },
  };
}
