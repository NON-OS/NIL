import { File, FileArchive, FileAudio, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo, Folder, Lock, Presentation } from 'lucide-react';
import previewKind from '../../lib/previewKind';

const SHEET = /(spreadsheet|excel|csv|numbers)/;
const SLIDES = /(presentation|powerpoint|keynote)/;
const ARCHIVE = /(zip|tar|gzip|x-7z|rar|bzip)/;

// The icon a file or folder shows where there's no thumbnail. Decorative: the name beside it
// says what it is.
export default function FileIcon({ kind, type, name, locked = false }: { kind: 'file' | 'folder'; type: string; name: string; locked?: boolean }) {
  if (locked) return <Lock aria-hidden="true" />;
  if (kind === 'folder') return <Folder aria-hidden="true" />;
  if (SHEET.test(type)) return <FileSpreadsheet aria-hidden="true" />;
  if (SLIDES.test(type)) return <Presentation aria-hidden="true" />;
  if (ARCHIVE.test(type)) return <FileArchive aria-hidden="true" />;
  switch (previewKind(type, name)) {
    case 'image':
      return <FileImage aria-hidden="true" />;
    case 'audio':
      return <FileAudio aria-hidden="true" />;
    case 'video':
      return <FileVideo aria-hidden="true" />;
    case 'pdf':
    case 'docx':
    case 'markdown':
      return <FileText aria-hidden="true" />;
    case 'text':
      return <FileCode aria-hidden="true" />;
    default:
      return <File aria-hidden="true" />;
  }
}
