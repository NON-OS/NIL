import type { Editor } from '@tiptap/core';
import store from '../../state/store';
import toMarkdown from './toMarkdown';

// What's in the editor as Markdown, for the AI draft's context: people by name, images by their
// description, since the words are all a draft needs.
export default function editorMarkdown(editor: Editor) {
  return toMarkdown(editor.getJSON(), { people: (id) => store.get().users[id]?.name ?? 'someone', imagePath: () => null });
}
