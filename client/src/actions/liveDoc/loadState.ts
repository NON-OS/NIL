import * as Y from 'yjs';
import docBody from '../../lib/docState/docBody';
import markdownToState from '../../lib/docState/markdownToState';
import REMOTE from './remote';
import type DocItem from '../../types/DocItem';

// Lays a saved version into the shared state: its state as it is, or, for a doc written before
// Docs v2, its Markdown converted the same way in every tab.
export default function loadState(ydoc: Y.Doc, doc: DocItem) {
  const state = docBody.isRich(doc.body) ? docBody.decode(doc.body) : markdownToState(doc.id, doc.version, doc.title, doc.body ?? '');
  Y.applyUpdate(ydoc, state, REMOTE);
}
