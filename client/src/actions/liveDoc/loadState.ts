import * as Y from 'yjs';
import docCheck from '../../lib/docState/docCheck';
import versionState from './versionState';
import REMOTE from './remote';
import type DocItem from '../../types/DocItem';

// Lays the first version into an empty shared state, once it's been checked on its own copy.
export default function loadState(ydoc: Y.Doc, doc: DocItem) {
  const state = versionState.of(doc);
  const check = new Y.Doc();
  try {
    Y.applyUpdate(check, state);
    if (!docCheck.whole(check)) throw new Error(versionState.unsafe);
  } catch {
    throw new Error(versionState.unsafe);
  } finally {
    check.destroy();
  }
  Y.applyUpdate(ydoc, state, REMOTE);
}
