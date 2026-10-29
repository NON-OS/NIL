import stripJpeg from './stripJpeg';
import stripPng from './stripPng';
import stripWebp from './stripWebp';
import stripGif from './stripGif';

const STRIP: Record<string, (bytes: Uint8Array) => Uint8Array> = {
  'image/jpeg': stripJpeg,
  'image/png': stripPng,
  'image/webp': stripWebp,
  'image/gif': stripGif,
};

// What a picture carries besides the picture: where it was taken, when, on which camera. It goes
// before the image is encrypted and sent. A kind of picture that can carry it but that Nil can't
// clean isn't sent at all; kinds that carry none (SVG, BMP) go as they are.
const UNCLEANABLE = /^image\/(heic|heif|avif|tiff|jxl|x-adobe-dng)$/;

const stripImageMetadata = {
  cleans: (type: string) => type in STRIP,
  run(bytes: Uint8Array, type: string) {
    const strip = STRIP[type];
    if (strip) return strip(bytes);
    if (UNCLEANABLE.test(type)) throw new Error('Nil can’t remove the location and camera details from this kind of picture, so it wasn’t sent. Send it as a JPEG, PNG, WebP or GIF.');
    return bytes;
  },
};

export default stripImageMetadata;
