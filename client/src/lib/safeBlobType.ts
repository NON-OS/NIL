// The type a decrypted file is handed out as. A blob: URL belongs to the app's own origin, so a
// file typed as HTML, SVG or XML could run as a page of Nil if someone opened it. Only types a
// browser shows without running anything keep their type; everything else is opaque bytes,
// still readable as text or saved under its own name.
const SHOWN = /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|audio\/[\w.+-]+|video\/[\w.+-]+|text\/plain)$/;

export default function safeBlobType(type: string) {
  const bare = type.split(';')[0].trim().toLowerCase();
  return SHOWN.test(bare) ? bare : 'application/octet-stream';
}
