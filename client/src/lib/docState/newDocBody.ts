import * as Y from 'yjs';
import docBody from './docBody';

// The body of a doc that has only a title so far.
export default function newDocBody(title: string) {
  const ydoc = new Y.Doc();
  ydoc.getText('title').insert(0, title);
  const body = docBody.encode(Y.encodeStateAsUpdate(ydoc));
  ydoc.destroy();
  return body;
}
