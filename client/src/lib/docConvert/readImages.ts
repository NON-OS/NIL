import type { JSONContent } from '@tiptap/core';
import type { OpenedImage } from './ExportOptions';
import type SealedImageAttrs from './SealedImageAttrs';

// how many images are fetched and decrypted at once
const AT_ONCE = 4;

function collect(node: JSONContent, found: Map<string, SealedImageAttrs>) {
  const attrs = node.attrs as SealedImageAttrs | undefined;
  if (node.type === 'sealedImage' && attrs?.blob && !found.has(attrs.blob)) found.set(attrs.blob, attrs);
  for (const child of node.content ?? []) collect(child, found);
}

// Opens every image in a doc once, however often it appears, keyed by its blob.
export default async function readImages(content: JSONContent, read: (attrs: SealedImageAttrs) => Promise<OpenedImage>) {
  const found = new Map<string, SealedImageAttrs>();
  collect(content, found);
  const queue = [...found.values()];
  const opened = new Map<string, { attrs: SealedImageAttrs; image: OpenedImage }>();
  const worker = async () => {
    for (let attrs = queue.shift(); attrs; attrs = queue.shift()) opened.set(attrs.blob, { attrs, image: await read(attrs) });
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, queue.length) }, worker));
  return opened;
}
