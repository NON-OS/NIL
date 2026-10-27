import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import docComments, { type CommentThread } from './docComments';

// The doc's comment threads, kept current as anyone adds, answers or resolves one.
export default function useThreads(ydoc: Y.Doc) {
  const [threads, setThreads] = useState<CommentThread[]>(() => docComments.threads(ydoc));
  useEffect(() => {
    const map = ydoc.getMap('comments');
    const read = () => setThreads(docComments.threads(ydoc));
    read();
    map.observeDeep(read);
    return () => map.unobserveDeep(read);
  }, [ydoc]);
  return threads;
}
