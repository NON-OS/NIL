import '../Files.css';
import { Download } from 'lucide-react';
import FileIcon from '../FileIcon';
import fileSize from '../../../lib/fileSize';
import type FolderItem from '../../../types/FolderItem';

// Anything without a preview here, SVG included: its icon, its details and a way to download it.
export default function NoPreview({ item, note, onDownload }: { item: FolderItem; note?: string; onDownload: () => void }) {
  return (
    <div className="files-placeholder">
      <FileIcon kind="file" type={item.type} name={item.name} />
      <strong>{item.name}</strong>
      <span className="muted num">
        {fileSize(item.size)} · {item.type}
      </span>
      <p className="muted" style={{ margin: 0, maxWidth: 420 }}>
        {note ?? 'There’s no preview for this kind of file. Download it to open it on your device.'}
      </p>
      <button type="button" className="btn btn-primary" onClick={onDownload}>
        <Download /> Download
      </button>
    </div>
  );
}
