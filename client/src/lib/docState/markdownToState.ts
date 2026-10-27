import * as Y from 'yjs';
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import importMarkdown from '../docConvert/importMarkdown';
import docSchema from '../docConvert/docSchema';
import fixedClient from './fixedClient';

// A doc written before Docs v2 holds Markdown. Every browser that opens it before anyone saves
// it again converts it on its own, so the result has to be the same byte for byte: with a client
// id fixed by the doc and version, two tabs converting at once make identical changes, which
// Yjs counts once instead of showing the text twice.
export default function markdownToState(docId: string, version: number, title: string, markdown: string) {
  const ydoc = new Y.Doc();
  ydoc.clientID = fixedClient(docId, version);
  const json = importMarkdown(markdown);
  ydoc.transact(() => {
    ydoc.getText('title').insert(0, title);
    prosemirrorJSONToYXmlFragment(docSchema(), json, ydoc.getXmlFragment('body'));
  });
  const state = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return state;
}
