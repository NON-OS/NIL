import * as Y from 'yjs';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import type { JSONContent } from '@tiptap/core';
import docCheck from './docCheck';

const UNSAFE = 'This version holds something Nil’s editor can’t show safely.';

// A doc's shared state as its title and editor content, for history, export and search. It's
// checked first (see docCheck), so a crafted version can't overflow the stack or freeze the tab.
export default function stateToJson(state: Uint8Array): { title: string; content: JSONContent } {
  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, state);
    if (!docCheck.whole(ydoc)) throw new Error(UNSAFE);
    return { title: ydoc.getText('title').toString(), content: yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment('body')) as JSONContent };
  } finally {
    ydoc.destroy();
  }
}
