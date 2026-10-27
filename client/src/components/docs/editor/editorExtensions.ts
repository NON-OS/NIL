import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { Extension } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import docNodes from './docNodes';
import SlashCommands from './SlashCommands';
import mentionSuggestion from './mentionSuggestion';
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
// and @ menus, Markdown for pasting, and a few keys of Nil's own.
export default function editorExtensions({ docId, ydoc, awareness, me, pick, comment, link }: Options) {
  const keys = Extension.create({
    name: 'nilDocKeys',
    addKeyboardShortcuts: () => ({
      'Mod-Alt-m': () => (comment(), true),
      'Mod-k': () => (link(), true),
    }),
  });
  return [
    ...docNodes({ undo: false, mention: { suggestion: mentionSuggestion } }),
    Collaboration.configure({ document: ydoc, field: 'body' }),
    CollaborationCaret.configure({ provider: { awareness }, user: { id: me, color: cursorColor(me) }, render: caretRender }),
    Placeholder.configure({ placeholder: ({ node }) => (node.type.name === 'heading' ? 'Heading' : 'Write, or type / for blocks and @ for people') }),
    CharacterCount,
    Markdown,
    SlashCommands.configure({ pick }),
    MentionNotices.configure({ me, notify: (userIds) => void http.post(`/docs/${docId}/mentions`, { userIds }).catch(() => {}) }),
    keys,
  ];
}
