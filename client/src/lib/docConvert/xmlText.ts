// Text as a Word file can hold it: XML 1.0 has no place for most control characters, and Word
// refuses to open a file that contains one.
export default function xmlText(text: string) {
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\u{fffe}\u{ffff}]/gu, '');
}
