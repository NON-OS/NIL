import * as Y from 'yjs';
import http from '../../api/http';
import docUpdateSeal from '../docUpdateSeal';
import REMOTE from './remote';
import type LiveContext from './liveContext';
import type EncryptedUpdate from '../../types/EncryptedUpdate';

// Takes in other people's changes in the order the server numbered them. A change is applied
// only once it opens with the doc key and its author's signature checks out; anything else is
// counted and left out. A gap in the numbers means a change went missing on the way, so the
// missing ones are fetched; if a newer version already covers them, the doc is reloaded.
export default function createInbox(ctx: LiveContext) {
  const waiting = new Map<number, EncryptedUpdate>();
  let chain = Promise.resolve();
  let filling = false;

  async function applyOne(u: EncryptedUpdate) {
    try {
      const opened = await docUpdateSeal.open(ctx.docId, ctx.key, u.updateCt, ctx.doc.readers);
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
      const res = await http.get<{ updates: EncryptedUpdate[] }>(`/docs/${ctx.docId}/updates?after=${ctx.through}`);
      for (const u of res.updates) if (u.seq > ctx.through) waiting.set(u.seq, u);
      filling = false;
      await drain();
    } catch (err: any) {
      filling = false;
      if (err?.status === 409) await ctx.reload();
    }
  }

  return {
    receive(updates: EncryptedUpdate[]) {
      for (const u of updates) if (u.seq > ctx.through) waiting.set(u.seq, u);
      chain = chain.then(drain, drain);
      return chain;
    },
  };
}
