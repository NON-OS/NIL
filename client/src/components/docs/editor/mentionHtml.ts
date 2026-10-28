import { mergeAttributes } from '@tiptap/core';
import type { MentionNodeAttrs } from '@tiptap/extension-mention';
import type { Node as PmNode } from '@tiptap/pm/model';
import store from '../../../state/store';

// A mention as the editor shows it: the name this tab knows for the account it points at, never
// the label stored with it, which whoever wrote the mention could have set to anything.
export default function mentionHtml({ options, node }: { options: { HTMLAttributes: Record<string, unknown> }; node: PmNode }) {
  const { id } = node.attrs as MentionNodeAttrs;
  const name = (id && store.get().users[id]?.name) || 'someone';
  return ['span', mergeAttributes({ 'data-type': 'mention', 'data-id': id }, options.HTMLAttributes), `@${name}`] as const;
}
