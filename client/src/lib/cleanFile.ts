import fileMeta from './fileMeta';
import imageCanvas from './imageCanvas';
import sniffImage from './sniffImage';
import imageHeaderSize from './imageHeaderSize';
import stripImageMetadata from './images/stripImageMetadata';
import officeClean from './officeClean';

const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// A name that says what the file now is, when cleaning an image changed its format.
const renamed = (name: string, from: string, to: string) => (from === to || !EXTENSION[to] ? name : `${name.replace(/\.[^.]*$/, '')}.${EXTENSION[to]}`);

// A file as Nil uploads it: a bare name and type, and its hidden details gone. A JPEG, PNG, WebP
// or GIF loses its EXIF, GPS position, XMP, comments and the rest byte by byte, the picture itself
// untouched (so quality, animation and colour profiles stay), and is drawn again only if it's too
// damaged to clean that way. A Word, Excel or PowerPoint file loses who wrote and last saved it,
// and the company and template it came from (see officeClean). An image is recognised by its type
// or by its first bytes, whichever says so. Everything else goes as it is.
export default async function cleanFile(file: Blob, name?: string) {
  const given = fileMeta(name ?? (file instanceof File ? file.name : ''), file.type);
  const type = stripImageMetadata.cleans(given.type) ? given.type : await sniffImage(file);
  if (!type) return { body: await officeClean(file, given.name), name: given.name, mime: given.type, width: null, height: null };
  try {
    const bytes = stripImageMetadata.run(new Uint8Array(await file.arrayBuffer()), type);
    const size = imageHeaderSize(bytes);
    return { body: new Blob([bytes], { type }), name: given.name, mime: type, width: size?.width ?? null, height: size?.height ?? null };
  } catch {
    if (!imageCanvas.cleans(type)) throw new Error('Nil couldn’t remove the hidden details from this picture, so it wasn’t uploaded.');
    const image = await imageCanvas.clean(file, type);
    return { body: image.blob, name: renamed(given.name, given.type, image.type), mime: image.type, width: image.width, height: image.height };
  }
}
