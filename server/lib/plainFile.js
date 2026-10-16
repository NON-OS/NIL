import path from 'node:path';

// A plain file's name and type as the server stores them: the bare name without control
// characters, quotes or slashes, and the type without its parameters.
export default function plainFile(name, type) {
  return {
    filename: path.basename(String(name || 'file')).replace(/[\u0000-\u001f\u007f"\\/]/g, '').slice(0, 200) || 'file',
    mime: String(type || '').split(';')[0].trim().toLowerCase().slice(0, 100) || 'application/octet-stream',
  };
}
