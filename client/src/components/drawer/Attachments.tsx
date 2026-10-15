import { useRef, useState } from 'react';
import { Download, FileText, Paperclip, Trash2 } from 'lucide-react';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import detail from '../../actions/detail';
import formatBytes from '../../lib/formatBytes';
import type Attachment from '../../types/Attachment';

const isImage = (a: Attachment) => /^image\/(png|jpeg|gif|webp)$/.test(a.mime);

export default function Attachments({ taskId }: { taskId: string }) {
  const attachments = useStore((s) => (s.detail?.taskId === taskId ? s.detail.attachments : null));
  const meId = useStore((s) => s.me?.id);
  const isAdmin = useStore((s) => s.me?.role !== 'member');
  const [uploading, setUploading] = useState(0);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (files: FileList | File[]) => {
    const list = [...files];
    setUploading((n) => n + list.length);
    for (const file of list) {
      await detail.upload(taskId, file);
      setUploading((n) => n - 1);
    }
  };

  return (
    <section
      className={`drawer-section dropzone${over ? ' over' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
    >
      <div className="section-head">
        <h3>Files {attachments && attachments.length > 0 && <span className="muted num">{attachments.length}</span>}</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()}>
          {uploading ? <Spinner size={13} /> : <Paperclip />}
          Attach
        </button>
        <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
      </div>
      {attachments && attachments.length > 0 ? (
        <ul className="attachments">
          {attachments.map((a) => (
            <li key={a.id}>
              {isImage(a) ? <img src={`/api/attachments/${a.id}`} alt="" loading="lazy" /> : <span className="file-icon"><FileText size={16} /></span>}
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer" className="file-name">
                {a.filename}
              </a>
              <span className="muted num">{formatBytes(a.size)}</span>
              <a className="icon-only" href={`/api/attachments/${a.id}?download`} aria-label={`Download ${a.filename}`}>
                <Download size={14} />
              </a>
              {(a.uploaderId === meId || isAdmin) && (
                <button type="button" className="icon-only" onClick={() => detail.deleteAttachment(a)} aria-label={`Remove ${a.filename}`}>
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Drop files here or use Attach. Files stay on your server.</p>
      )}
    </section>
  );
}
