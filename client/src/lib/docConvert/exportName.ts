// A file name from a doc's title that Windows, macOS and Linux all accept.
export default function exportName(title: string) {
  const name = title
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 100)
    .trim();
  if (!name) return 'Untitled';
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name) ? `${name} doc` : name;
}
