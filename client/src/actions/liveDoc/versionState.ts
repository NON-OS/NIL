import docBody from '../../lib/docState/docBody';
import markdownToState from '../../lib/docState/markdownToState';
import type DocItem from '../../types/DocItem';

// A saved version's shared state: its state as it is, or, for a doc written before Docs v2, its
// Markdown converted the same way in every tab. `unsafe` is what to say when one fails its check.
const versionState = {
  unsafe: 'This version holds something Nil’s editor can’t show safely, so it won’t open it. An earlier version in its history may.',
  of: (doc: DocItem) => (docBody.isRich(doc.body) ? docBody.decode(doc.body) : markdownToState(doc.id, doc.version, doc.title, doc.body ?? '')),
};

export default versionState;
