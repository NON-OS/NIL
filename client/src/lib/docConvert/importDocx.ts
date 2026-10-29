import type { JSONContent } from '@tiptap/core';
import docxStyleMap from './docxStyleMap';
import zipCheck from '../zipCheck';
import tagDocxStyles from './tagDocxStyles';
import type SealedImageAttrs from './SealedImageAttrs';

type OnImage = (bytes: Uint8Array, mime: string, alt: string) => Promise<SealedImageAttrs>;

// Larger Word files are refused before anything unpacks them.
const MAX_BYTES = 40 * 1024 * 1024;
// what it may unpack to, measured by unpacking it first, so a zip bomb can't fill the tab's memory
const MAX_UNPACKED = 200 * 1024 * 1024;
const MAX_ENTRIES = 5000;
// and images past this many are left out rather than uploaded one by one
const MAX_IMAGES = 300;
// The image types a doc shows. Word's own EMF and WMF drawings, TIFF and SVG are left out.
const SHOWN: Record<string, string> = { 'image/png': 'image/png', 'image/jpeg': 'image/jpeg', 'image/jpg': 'image/jpeg', 'image/gif': 'image/gif', 'image/webp': 'image/webp' };

// Reads a Word file into doc content, in the browser. Each image is handed to onImage, which
// seals and uploads it and returns the node's attributes; the content refers to images only by
// those. The title comes from Word's Title paragraph, if the file opens with one.
export default async function importDocx(file: Blob, opts: { onImage: OnImage }): Promise<{ title: string | null; content: JSONContent }> {
  if (file.size > MAX_BYTES) throw new Error('This Word file is too large to import.');
  const [{ default: mammoth }, { default: parseDocxHtml }] = await Promise.all([import('mammoth'), import('./parseDocxHtml')]);
  const data = await file.arrayBuffer();
  await zipCheck(new Uint8Array(data), { maxEntries: MAX_ENTRIES, maxBytes: MAX_UNPACKED, message: 'This Word file unpacks to more than Nil will open.' });
  const images: SealedImageAttrs[] = [];
  let seen = 0;
  const convertImage = mammoth.images.imgElement(async (image) => {
    // mammoth's types ask for a src, but it takes any attributes, and these images have none
    const attrs: Record<string, string> = {};
    const mime = SHOWN[image.contentType.toLowerCase()];
    if (!mime || seen++ >= MAX_IMAGES) return attrs as { src: string };
    const alt = (image as { altText?: string }).altText ?? '';
    const sealed = await opts.onImage(new Uint8Array(await image.readAsArrayBuffer()), mime, alt);
    attrs['data-image'] = String(images.push(sealed) - 1);
    return attrs as { src: string };
  });
  // the browser build of mammoth reads arrayBuffer, the Node one (the tests) buffer
  const input = { arrayBuffer: data, buffer: data };
  const { value } = await mammoth.convertToHtml(input as { arrayBuffer: ArrayBuffer }, {
    styleMap: docxStyleMap,
    convertImage,
    transformDocument: tagDocxStyles,
    ignoreEmptyParagraphs: false,
    externalFileAccess: false,
  });
  return parseDocxHtml(value, images);
}
