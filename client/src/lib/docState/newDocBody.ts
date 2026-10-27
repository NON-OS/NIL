import * as Y from 'yjs';
import { MarkdownManager } from '@tiptap/markdown';
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import docNodes from '../../components/docs/editor/docNodes';
import docSchema from './docSchema';
import docBody from './docBody';

// The body of a new doc: its title, and a template's text when it starts from one.
export default function newDocBody(title: string, markdown?: string) {
  const ydoc = new Y.Doc();
  ydoc.transact(() => {
    ydoc.getText('title').insert(0, title);
    if (markdown) prosemirrorJSONToYXmlFragment(docSchema(), new MarkdownManager({ extensions: docNodes() }).parse(markdown), ydoc.getXmlFragment('body'));
  });
  const body = docBody.encode(Y.encodeStateAsUpdate(ydoc));
  ydoc.destroy();
  return body;
}
