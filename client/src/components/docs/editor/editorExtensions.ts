import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { Extension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { ReactNodeViewRenderer } from '@tiptap/react';
import docNodes from './docNodes';
import SealedImage from './SealedImage';
import SealedFile from './SealedFile';
import SealedImageView from './SealedImageView';
import SealedFileView from './SealedFileView';
import SlashCommands from './SlashCommands';
import mentionSuggestion from './mentionSuggestion';
import mentionHtml from './mentionHtml';
import caretRender from './caretRender';
import MentionNotices from './MentionNotices';
import http from '../../../api/http';
import cursorColor from '../../../lib/docState/cursorColor';

interface Options {
  docId: string;
  ydoc: Y.Doc;
  awareness: Awareness;
  me: string;
  pick: (kind: 'image' | 'file') => void;
  comment: () => void;
  link: () => void;
}

// The live editor: the doc schema, bound to the shared state, with teammates' cursors, the /
// and @ menus, and a few keys of Nil's own.
export default function editorExtensions({ docId, ydoc, awareness, me, pick, comment, link }: Options) {
  const keys = Extension.create({
    name: 'nilDocKeys',
    addKeyboardShortcuts: () => ({
      'Mod-Alt-m': () => (comment(), true),
      'Mod-k': () => (link(), true),
    }),
  });
  return [
    // images and files show decrypted in the editor; elsewhere they're plain nodes
    ...docNodes({ undo: false, mention: { suggestion: mentionSuggestion, renderHTML: mentionHtml } }).filter((e) => e.name !== 'sealedImage' && e.name !== 'sealedFile'),
    SealedImage.extend({ addNodeView: () => ReactNodeViewRenderer(SealedImageView) }),
    SealedFile.extend({ addNodeView: () => ReactNodeViewRenderer(SealedFileView) }),
    Collaboration.configure({ document: ydoc, field: 'body' }),
    CollaborationCaret.configure({ provider: { awareness }, user: { id: me, color: cursorColor(me) }, render: caretRender }),
    Placeholder.configure({ placeholder: ({ node }) => (node.type.name === 'heading' ? 'Heading' : 'Write, or type / for blocks and @ for people') }),
    CharacterCount,
    SlashCommands.configure({ pick }),
    MentionNotices.configure({ me, notify: (userIds) => void http.post(`/docs/${docId}/mentions`, { userIds }).catch(() => {}) }),
    keys,
  ];
}
