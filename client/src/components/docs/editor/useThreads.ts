import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import docComments, { type CommentThread } from './docComments';

// The doc's comment threads, kept current as anyone adds, answers or resolves one. Messages show
// straight away and pick up whether their signatures check out a moment later.
export default function useThreads(ydoc: Y.Doc, docId: string) {
  const [threads, setThreads] = useState<CommentThread[]>(() => docComments.threads(ydoc));
  useEffect(() => {
    const map = ydoc.getMap('comments');
    let run = 0;
    const read = () => {
      const mine = ++run;
      const now = docComments.threads(ydoc);
      setThreads((before) => now.map((t) => carry(t, before.find((b) => b.id === t.id))));
      void Promise.all(now.map((t) => docComments.verify(docId, t))).then((checked) => mine === run && setThreads(checked));
    };
    read();
    map.observeDeep(read);
    return () => {
      run++;
      map.unobserveDeep(read);
    };
  }, [ydoc, docId]);
  return threads;
}

// what was already checked stays checked while the new state is looked at, so nothing flickers
function carry(t: CommentThread, before: CommentThread | undefined): CommentThread {
  if (!before) return { ...t, by: '' };
  const seen = new Map(before.messages.map((m) => [`${m.id}:${m.sig}:${m.text}`, m.verified]));
  const messages = t.messages.map((m) => ({ ...m, verified: seen.get(`${m.id}:${m.sig}:${m.text}`) }));
  return { ...t, by: before.quote === t.quote && messages[0]?.verified ? messages[0].by : '', messages };
}
