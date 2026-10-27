import type { Editor } from '@tiptap/react';
import docBody from '../../../lib/docState/docBody';
import stateToJson from '../../../lib/docState/stateToJson';

// Brings an earlier version back as a new change on top, so everyone editing sees it arrive and
// the version it replaces stays in the history.
export default function restoreVersion(editor: Editor, setTitle: (t: string) => void, title: string, body: string) {
  setTitle(title);
  if (docBody.isRich(body)) editor.commands.setContent(stateToJson(docBody.decode(body)).content);
  else editor.commands.setContent(body, { contentType: 'markdown' });
}
