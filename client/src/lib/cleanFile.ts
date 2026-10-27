import fileMeta from './fileMeta';
import imageCanvas from './imageCanvas';
import sniffImage from './sniffImage';

const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// A name that says what the file now is, when cleaning an image changed its format.
const renamed = (name: string, from: string, to: string) => (from === to || !EXTENSION[to] ? name : `${name.replace(/\.[^.]*$/, '')}.${EXTENSION[to]}`);

// A file as Nil uploads it: a bare name and type, and a JPEG, PNG or WebP drawn again with
// nothing but its pixels, so its EXIF, GPS position and other hidden details stay behind. An
// image is recognised by its type or by its first bytes, whichever says so. SVG and every other
// type go as they are, as plain files.
export default async function cleanFile(file: Blob, name?: string) {
  const given = fileMeta(name ?? (file instanceof File ? file.name : ''), file.type);
  const type = imageCanvas.cleans(given.type) ? given.type : await sniffImage(file);
  if (!type) return { body: file, name: given.name, mime: given.type, width: null, height: null };
  const image = await imageCanvas.clean(file, type);
  return { body: image.blob, name: renamed(given.name, given.type, image.type), mime: image.type, width: image.width, height: image.height };
}
