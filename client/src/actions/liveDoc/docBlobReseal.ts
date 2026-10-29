import * as Y from 'yjs';
import http from '../../api/http';
import b64u from '../../lib/crypto/b64u';
import blobTransfer from '../blobTransfer';
import type LiveDoc from '../../types/LiveDoc';
import type DocItem from '../../types/DocItem';

const SEALED = new Set(['sealedImage', 'sealedFile']);
// how long to wait for the doc's change to reach the server before the old copy is let go
const SETTLE_MS = 60_000;

// every picture and file node in the doc that points at `blob`
function nodesFor(ydoc: Y.Doc, blob: string) {
  const out: Y.XmlElement[] = [];
  const stack: unknown[] = ydoc.getXmlFragment('body').toArray();
  while (stack.length) {
    const node = stack.pop();
    if (!(node instanceof Y.XmlElement)) continue;
    if (SEALED.has(node.nodeName) && node.getAttribute('blob') === blob) out.push(node);
    stack.push(...node.toArray());
  }
  return out;
}

async function settled(live: LiveDoc) {
  for (const until = Date.now() + SETTLE_MS; Date.now() < until; await new Promise((r) => setTimeout(r, 500))) if (!live.pending() && live.status().state === 'saved') return true;
  return false;
}

// After someone was taken out of a doc, each of its pictures and files is encrypted again under a
// fresh key, by the browser of whoever opens the doc next: a copy made chunk by chunk, the doc
// changed to point at it with its new key, and once that change is on the server, the old copy
// let go. A copy another tab already pointed the doc at is let go of the same way.
export default async function docBlobReseal(live: LiveDoc, doc: DocItem, signal?: AbortSignal) {
  if (!doc.reseal) return;
  const scope = { kind: 'doc' as const, id: doc.id };
  const adopt: string[] = [];
  for (const old of doc.reseal.waiting) {
    signal?.throwIfAborted();
    const done = doc.reseal.copies.find((c) => c.replaces === old && nodesFor(live.ydoc, c.id).length);
    if (done) {
      adopt.push(done.id);
      continue;
    }
    const nodes = nodesFor(live.ydoc, old);
    const key = nodes[0]?.getAttribute('key');
    if (typeof key !== 'string' || !key) continue;
    const fresh = crypto.getRandomValues(new Uint8Array(32));
    try {
      const copy = await blobTransfer.copy(await blobTransfer.info(old, signal), b64u.decode(key), fresh, scope, { replaces: old, signal });
      await blobTransfer.finish(copy);
      live.ydoc.transact(() => {
        for (const node of nodesFor(live.ydoc, old)) {
          node.setAttribute('blob', copy);
          node.setAttribute('key', b64u.encode(fresh));
        }
      });
      adopt.push(copy);
    } finally {
      fresh.fill(0);
    }
  }
  if (!adopt.length || !(await settled(live))) return;
  for (const copy of adopt) await http.post(`/blobs/${copy}/adopt`).catch(() => {});
}
