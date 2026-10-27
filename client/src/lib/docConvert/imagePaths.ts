import type { OpenedImage } from './ExportOptions';
import type SealedImageAttrs from './SealedImageAttrs';

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/svg+xml': 'svg' };

const slug = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

// Where each image goes in a Markdown export's zip: images/ and the image's own name, made safe
// to write in a relative link without escaping, and unique. Keyed by blob, as readImages is.
export default function imagePaths(images: Map<string, { attrs: SealedImageAttrs; image: OpenedImage }>) {
  const taken = new Set<string>();
  const paths = new Map<string, string>();
  for (const [blob, { attrs, image }] of images) {
    const extension = EXTENSIONS[image.mime] ?? 'bin';
    const stem = slug(String(attrs.name ?? '').replace(/\.[a-z0-9]{1,5}$/i, '')) || 'image';
    let file = `${stem}.${extension}`;
    for (let n = 2; taken.has(file); n++) file = `${stem}-${n}.${extension}`;
    taken.add(file);
    paths.set(blob, `images/${file}`);
  }
  return paths;
}
