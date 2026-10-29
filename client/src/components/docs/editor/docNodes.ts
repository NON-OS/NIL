import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Mention, { type MentionOptions } from '@tiptap/extension-mention';
import SealedImage from './SealedImage';
import SealedFile from './SealedFile';
import CommentMark from './CommentMark';

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;

// Everything a doc can hold. The editor, the Word and Markdown converters and the upgrade of
// older Markdown docs all build on this list, so they agree on one schema. Live editing brings
// its own undo, so the editor turns the built-in one off.
export default function docNodes({ undo = true, mention }: { undo?: boolean; mention?: Partial<MentionOptions> } = {}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      undoRedo: undo ? {} : false,
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https', isAllowedUri: (url) => SAFE_LINK.test(url), HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: true } }),
    Highlight,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Mention.configure({ HTMLAttributes: { class: 'doc-mention' }, renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`, ...mention }),
    SealedImage,
    SealedFile,
    CommentMark,
  ];
}
