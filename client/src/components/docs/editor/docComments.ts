import * as Y from 'yjs';
import docCommentSeal, { type SignedMessage } from '../../../actions/docCommentSeal';

export interface CommentMessage extends SignedMessage {
  // whether its signature checked out; unset until it's been checked
  verified?: boolean;
}

export interface CommentThread {
  id: string;
  quote: string;
  by: string;
  at: number;
  resolved: boolean;
  messages: CommentMessage[];
}

const MAX_TEXT = 4000;
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(16).padStart(2, '0')).join('');

const message = (docId: string, thread: string, text: string, quote: string) => docCommentSeal.sign(docId, thread, { id: newId(), at: Date.now(), text: text.slice(0, MAX_TEXT) }, quote);

// Comment threads live in the doc's shared state, beside the text they're about, so they're
// encrypted and synced exactly like the text, and each message is signed by its author on top.
// Everyone who can read the doc can read and answer them.
const docComments = {
  threads(ydoc: Y.Doc): CommentThread[] {
    const out: CommentThread[] = [];
    ydoc.getMap<Y.Map<unknown>>('comments').forEach((t, id) => {
      if (!(t instanceof Y.Map)) return;
      const messages = t.get('messages');
      out.push({
        id,
        quote: String(t.get('quote') ?? '').slice(0, 300),
        by: String(t.get('by') ?? ''),
        at: Number(t.get('at')) || 0,
        resolved: t.get('resolved') === true,
        messages: messages instanceof Y.Array ? (messages.toArray() as CommentMessage[]).filter((m) => m && typeof m.id === 'string' && typeof m.text === 'string') : [],
      });
    });
    return out;
  },

  start(ydoc: Y.Doc, docId: string, quote: string, text: string) {
    const id = newId();
    const first = message(docId, id, text, quote.slice(0, 300));
    ydoc.transact(() => {
      const t = new Y.Map<unknown>();
      const messages = new Y.Array<CommentMessage>();
      ydoc.getMap('comments').set(id, t);
      t.set('quote', quote.slice(0, 300));
      t.set('by', first.by);
      t.set('at', first.at);
      t.set('resolved', false);
      t.set('messages', messages);
      messages.push([first]);
    });
    return id;
  },

  reply(ydoc: Y.Doc, docId: string, thread: string, text: string) {
    const messages = ydoc.getMap<Y.Map<unknown>>('comments').get(thread)?.get('messages');
    if (messages instanceof Y.Array) messages.push([message(docId, thread, text, '')]);
  },

  // Checks every message's signature. The first message also vouches for the words the thread
  // is about, and the thread counts as started by whoever signed it.
  async verify(docId: string, thread: CommentThread): Promise<CommentThread> {
    const messages = await Promise.all(thread.messages.map(async (m, i) => ({ ...m, verified: await docCommentSeal.verify(docId, thread.id, m, i === 0 ? thread.quote : '') })));
    return { ...thread, by: messages[0]?.verified ? messages[0].by : '', messages };
  },

  resolve(ydoc: Y.Doc, thread: string, resolved: boolean) {
    ydoc.getMap<Y.Map<unknown>>('comments').get(thread)?.set('resolved', resolved);
  },

  remove(ydoc: Y.Doc, thread: string) {
    ydoc.getMap('comments').delete(thread);
  },
};

export default docComments;
