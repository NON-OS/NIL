import * as Y from 'yjs';
import { prosemirrorJSONToYXmlFragment } from '@tiptap/y-tiptap';
import importMarkdown from '../docConvert/importMarkdown';
import docSchema from '../docConvert/docSchema';
import docBody from './docBody';

// The body of a new doc: its title, and a template's text when it starts from one.
export default function newDocBody(title: string, markdown?: string) {
  const ydoc = new Y.Doc();
  ydoc.transact(() => {
    ydoc.getText('title').insert(0, title);
    if (markdown) prosemirrorJSONToYXmlFragment(docSchema(), importMarkdown(markdown), ydoc.getXmlFragment('body'));
  });
  const body = docBody.encode(Y.encodeStateAsUpdate(ydoc));
  ydoc.destroy();
  return body;
}
