import { Extension } from '@tiptap/core';
import { isChangeOrigin } from '@tiptap/extension-collaboration';
import type { Node } from '@tiptap/pm/model';

// people mentioned within this long go out as one notice
const WAIT_MS = 1500;

const mentioned = (doc: Node) => {
  const ids = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name === 'mention' && typeof node.attrs.id === 'string') ids.add(node.attrs.id);
  });
  return ids;
};

// Tells teammates when this person @-mentions them in the doc. Only mentions typed here count,
// not ones arriving from others or already in the doc when it opened.
const MentionNotices = Extension.create<{ me: string; notify: (userIds: string[]) => void }, { seen: Set<string>; pending: Set<string>; timer: ReturnType<typeof setTimeout> | undefined }>({
  name: 'mentionNotices',

  addOptions() {
    return { me: '', notify: () => {} };
  },

  addStorage() {
    return { seen: new Set<string>(), pending: new Set<string>(), timer: undefined };
  },

  onCreate() {
    this.storage.seen = mentioned(this.editor.state.doc);
  },

  onTransaction({ transaction }) {
    if (!transaction.docChanged) return;
    const now = mentioned(this.editor.state.doc);
    if (!isChangeOrigin(transaction)) for (const id of now) if (!this.storage.seen.has(id) && id !== this.options.me) this.storage.pending.add(id);
    this.storage.seen = now;
    if (!this.storage.pending.size || this.storage.timer) return;
    this.storage.timer = setTimeout(() => {
      this.storage.timer = undefined;
      const ids = [...this.storage.pending].filter((id) => this.storage.seen.has(id));
      this.storage.pending.clear();
      if (ids.length) this.options.notify(ids);
    }, WAIT_MS);
  },

  onDestroy() {
    clearTimeout(this.storage.timer);
  },
});

export default MentionNotices;
