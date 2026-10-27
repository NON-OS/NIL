import formatBytes from '../formatBytes';

// A file attached in a doc, as a line of text: an export can't carry the file itself.
export default function fileLine(attrs: Record<string, unknown> | undefined) {
  const size = Number(attrs?.size);
  return `Attached file: ${attrs?.name || 'file'}${size > 0 ? ` (${formatBytes(size)})` : ''}`;
}
