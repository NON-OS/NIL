import { Download, FileText, Trash2 } from 'lucide-react';
import detail from '../../actions/detail';
import formatBytes from '../../lib/formatBytes';
import isImage from '../../lib/isImage';
import type Attachment from '../../types/Attachment';

// A plain file: the server shows it inline when that's safe, and the browser opens or saves it.
export default function FileRow({ attachment: a, canRemove }: { attachment: Attachment; canRemove: boolean }) {
  return (
    <li>
      {isImage(a) ? <img src={`/api/attachments/${a.id}`} alt="" loading="lazy" /> : <span className="file-icon"><FileText size={16} /></span>}
      <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer" className="file-name">
        {a.filename}
      </a>
      <span className="muted num">{formatBytes(a.size)}</span>
      <a className="icon-only" href={`/api/attachments/${a.id}?download`} aria-label={`Download ${a.filename}`}>
        <Download size={14} />
      </a>
      {canRemove && (
        <button type="button" className="icon-only" onClick={() => detail.deleteAttachment(a)} aria-label={`Remove ${a.filename}`}>
          <Trash2 size={14} />
        </button>
      )}
    </li>
  );
}
