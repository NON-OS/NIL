// What a file's first bytes say it is, for the image formats Nil cleans: JPEG, PNG, WebP or GIF. A
// photo can arrive with no type, or a wrong one, from a paste or a drag out of another app, and
// it would carry its hidden details along if only its stated type were trusted.
export default async function sniffImage(file: Blob): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const text = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head[0] === 0x89 && text(1, 4) === 'PNG') return 'image/png';
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
  if (text(0, 6) === 'GIF87a' || text(0, 6) === 'GIF89a') return 'image/gif';
  return null;
}
