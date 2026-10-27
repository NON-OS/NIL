import type { OpenedImage } from './ExportOptions';

const WORD_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/bmp']);

// Word can't hold WebP, so an image in a format it doesn't take is redrawn as PNG where the
// browser can do that. Otherwise it comes back as it was, and the export names it instead.
export default async function docxReady(image: OpenedImage): Promise<OpenedImage> {
  if (WORD_TYPES.has(image.mime) || typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return image;
  try {
    const bitmap = await createImageBitmap(new Blob([image.bytes], { type: image.mime }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    bitmap.close();
    const png = await canvas.convertToBlob({ type: 'image/png' });
    return { bytes: new Uint8Array(await png.arrayBuffer()), mime: 'image/png', width: canvas.width, height: canvas.height };
  } catch {
    return image;
  }
}
