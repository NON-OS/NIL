import type Attachment from '../types/Attachment';

// Images an <img> can show without any chance of running script, which leaves SVG out.
export default function isImage(a: Attachment) {
  return /^image\/(png|jpeg|gif|webp)$/.test(a.mime);
}
