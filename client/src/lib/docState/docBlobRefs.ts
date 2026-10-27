import * as Y from 'yjs';
import docBody from './docBody';

const SEALED = new Set(['sealedImage', 'sealedFile']);

// The encrypted pictures and files a doc body uses, by blob id, so the server can let go of ones
// nobody uses any more. Markdown bodies from before Docs v2 can't hold any.
export default function docBlobRefs(body: string): string[] {
  if (!docBody.isRich(body)) return [];
  const ydoc = new Y.Doc();
  const out = new Set<string>();
  const walk = (node: unknown) => {
    if (!(node instanceof Y.XmlElement)) return;
    const blob = SEALED.has(node.nodeName) ? node.getAttribute('blob') : undefined;
    if (typeof blob === 'string' && blob) out.add(blob);
    node.toArray().forEach(walk);
  };
  try {
    Y.applyUpdate(ydoc, docBody.decode(body));
    ydoc.getXmlFragment('body').toArray().forEach(walk);
  } finally {
    ydoc.destroy();
  }
  return [...out];
}
