import type { JSONContent } from '@tiptap/core';

const BLOCKS = new Set(['paragraph', 'heading', 'blockquote', 'codeBlock', 'listItem', 'taskItem', 'tableRow', 'horizontalRule', 'sealedImage', 'sealedFile']);

// The words of a doc, one block a line, for search and short previews. Mentions read as @name,
// and images and files by their names.
export default function jsonText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'mention') return `@${node.attrs?.label ?? ''}`;
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'sealedImage' || node.type === 'sealedFile') return `${node.attrs?.alt || node.attrs?.name || ''}\n`;
  const inner = (node.content ?? []).map(jsonText).join(node.type === 'tableRow' ? '\t' : '');
  return BLOCKS.has(node.type ?? '') ? `${inner}\n` : inner;
}
