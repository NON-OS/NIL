import type * as Docx from 'docx';
import type { OpenedImage } from './ExportOptions';
import type SealedImageAttrs from './SealedImageAttrs';
import xmlText from './xmlText';

const TYPES: Record<string, 'png' | 'jpg' | 'gif' | 'bmp'> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/bmp': 'bmp' };
// what fits across an A4 or Letter page between the margins, in pixels at 96 to the inch
const MAX_WIDTH = 600;

// An image as Word draws it: at the size the doc shows it, scaled down to fit the page, with its
// alt text. One Word can't hold becomes a line naming it.
export default function docxImage(d: typeof Docx, attrs: SealedImageAttrs, image: OpenedImage | undefined): Docx.ParagraphChild {
  const type = image && TYPES[image.mime];
  const alt = xmlText(attrs.alt || '');
  if (!image || !type) return new d.TextRun(`[Image${alt ? `: ${alt}` : ''}]`);
  const width = Number(attrs.width) || image.width || 300;
  const height = Number(attrs.height) || (image.width && image.height ? (image.height * width) / image.width : 200);
  const scale = Math.min(1, MAX_WIDTH / width);
  return new d.ImageRun({
    type,
    data: image.bytes,
    transformation: { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) },
    altText: { name: xmlText(attrs.name || 'image'), description: alt, title: alt },
  });
}
