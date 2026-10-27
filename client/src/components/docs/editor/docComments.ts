import * as Y from 'yjs';

export interface CommentMessage {
  id: string;
  by: string;
  at: number;
  text: string;
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

// Comment threads live in the doc's shared state, beside the text they're about, so they're
// encrypted, signed and synced exactly like the text. Everyone who can read the doc can read and
// answer them.
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
        messages: messages instanceof Y.Array ? (messages.toArray() as CommentMessage[]).filter((m) => m && typeof m.text === 'string') : [],
      });
    });
    return out;
  },

  start(ydoc: Y.Doc, by: string, quote: string, text: string) {
    const id = newId();
    ydoc.transact(() => {
      const t = new Y.Map<unknown>();
      const messages = new Y.Array<CommentMessage>();
      ydoc.getMap('comments').set(id, t);
      t.set('quote', quote.slice(0, 300));
      t.set('by', by);
      t.set('at', Date.now());
      t.set('resolved', false);
      t.set('messages', messages);
      messages.push([{ id: newId(), by, at: Date.now(), text: text.slice(0, MAX_TEXT) }]);
    });
    return id;
  },

  reply(ydoc: Y.Doc, thread: string, by: string, text: string) {
    const messages = ydoc.getMap<Y.Map<unknown>>('comments').get(thread)?.get('messages');
    if (messages instanceof Y.Array) messages.push([{ id: newId(), by, at: Date.now(), text: text.slice(0, MAX_TEXT) }]);
  },

  resolve(ydoc: Y.Doc, thread: string, resolved: boolean) {
    ydoc.getMap<Y.Map<unknown>>('comments').get(thread)?.set('resolved', resolved);
  },

  remove(ydoc: Y.Doc, thread: string) {
    ydoc.getMap('comments').delete(thread);
  },
};

export default docComments;
