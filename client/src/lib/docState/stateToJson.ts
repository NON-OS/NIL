import * as Y from 'yjs';
import { yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import type { JSONContent } from '@tiptap/core';

// A doc's shared state as its title and editor content, for history, export and search.
export default function stateToJson(state: Uint8Array): { title: string; content: JSONContent } {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, state);
  const out = { title: ydoc.getText('title').toString(), content: yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment('body')) as JSONContent };
  ydoc.destroy();
  return out;
}
