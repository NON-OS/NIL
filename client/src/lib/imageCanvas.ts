// Photos carry details nobody sees: EXIF with the camera, the time and often the GPS position,
// plus XMP and comments. Drawing a JPEG, PNG or WebP onto a canvas and encoding it again keeps
// only the pixels, turned the way the photo says (imageOrientation 'from-image'). Safari on iOS
// won't encode a canvas over 16.7 million pixels or 16384 on a side, so a larger photo is scaled
// down to fit.
const CLEANED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const THUMBNAILED = new Set([...CLEANED, 'image/gif']);
const MAX_PIXELS = 16_777_216;
const MAX_SIDE = 16_384;
const QUALITY = 0.92;
const THUMB_QUALITY = 0.8;

async function encode(source: ImageBitmap, width: number, height: number, type: string, quality: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, width, height);
    return canvas.convertToBlob({ type, quality }).catch(() => null);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

const fit = (width: number, height: number, scale: number) => ({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) });

const imageCanvas = {
  cleans: (type: string) => CLEANED.has(type),
  thumbnails: (type: string) => THUMBNAILED.has(type),

  // The image drawn again with nothing but its pixels, in the same format where the browser can
  // write it (the type says which it wrote), with its size in pixels. Throws when the image
  // can't be read or written, rather than ever passing the original on.
  async clean(file: Blob, type: string) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
    if (!bitmap) throw new Error('Nil couldn’t read this image to remove its hidden details, such as where it was taken, so it didn’t upload it.');
    try {
      const scale = Math.min(1, Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)), MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const size = fit(bitmap.width, bitmap.height, scale);
      const blob = await encode(bitmap, size.width, size.height, type, QUALITY);
      if (blob?.size) return { blob, type: blob.type || type, ...size };
    } finally {
      bitmap.close();
    }
    throw new Error('This image is too large for this browser to clean of its hidden details, so Nil didn’t upload it.');
  },

  // A small copy for the grid, at most `side` pixels on its longer edge.
  async thumbnail(file: Blob, side: number) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
    if (!bitmap) return null;
    try {
      const size = fit(bitmap.width, bitmap.height, Math.min(1, side / Math.max(bitmap.width, bitmap.height)));
      const webp = await encode(bitmap, size.width, size.height, 'image/webp', THUMB_QUALITY);
      return webp?.type === 'image/webp' ? webp : await encode(bitmap, size.width, size.height, 'image/png', THUMB_QUALITY);
    } finally {
      bitmap.close();
    }
  },
};

export default imageCanvas;
