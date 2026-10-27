import stripBidi from './stripBidi';

// A folder's name as Nil shows it: no control characters or direction marks, at most 200
// characters, and something to show when nothing's left. Applied to every decrypted name, since
// another key holder wrote it.
export default function folderLabel(name: unknown) {
  return stripBidi(String(name ?? '')).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200) || 'Untitled folder';
}
