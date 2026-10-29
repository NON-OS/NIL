import type { JSONContent } from '@tiptap/core';

const textOf = (node: JSONContent): string => (node.text ?? '') + (node.content ?? []).map(textOf).join('');

// A file that opens with a top-level heading is naming itself. When it becomes a new doc, that
// heading is the doc's title, so it comes out of the body rather than showing twice.
export default function liftTitle(blocks: JSONContent[]): { title: string | null; blocks: JSONContent[] } {
  const first = blocks[0];
  if (first?.type !== 'heading' || first.attrs?.level !== 1) return { title: null, blocks };
  const title = textOf(first).replace(/\s+/g, ' ').trim();
  return title ? { title, blocks: blocks.slice(1) } : { title: null, blocks };
}
