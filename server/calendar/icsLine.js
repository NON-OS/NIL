// iCalendar lines may be at most 75 bytes; longer ones continue on lines starting with a space.
const MAX_BYTES = 75;

// Text values escape backslashes, semicolons, commas and line breaks (RFC 5545, 3.3.11).
// Other control characters have no business in a calendar and are dropped.
const escape = (value) =>
  String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/[\u0000-\u001f\u007f]/g, '');

// One content line, escaped when it's text and folded without splitting a UTF-8 character.
export default function icsLine(name, value, { text = false } = {}) {
  const line = `${name}:${text ? escape(value) : value}`;
  const out = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    // continuation lines start with a space, which counts toward their 75 bytes
    if (bytes + size > MAX_BYTES) {
      out.push(current);
      current = ' ';
      bytes = 1;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n');
}
