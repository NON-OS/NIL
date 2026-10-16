import { useState } from 'react';
import { Download, FileText, Lock, Trash2 } from 'lucide-react';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import detail from '../../actions/detail';
import saveFile from '../../actions/saveFile';
import useFilePreview from '../../hooks/useFilePreview';
import formatBytes from '../../lib/formatBytes';
import fileCipher from '../../lib/crypto/fileCipher';
import type Attachment from '../../types/Attachment';
import type Task from '../../types/Task';

// A file on a private task. Its name was decrypted in this tab, an image is previewed from a
// blob: URL that goes with the row, and saving decrypts the file again. Nothing here opens it in
// a new tab, where a crafted file could run as a page on Nil's origin. One this tab can't open
// shows as locked.
export default function SealedFileRow({ task, attachment: a, canRemove }: { task: Task; attachment: Attachment; canRemove: boolean }) {
  const preview = useFilePreview(task, a);
  const [saving, setSaving] = useState(false);
  const name = a.locked ? 'Encrypted file' : a.filename;

  const save = async () => {
    setSaving(true);
    try {
      await saveFile(task, a);
    } catch (err) {
      toast.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={a.locked ? 'file-locked' : undefined}>
      {preview ? <img src={preview} alt="" /> : <span className="file-icon">{a.locked ? <Lock size={16} /> : <FileText size={16} />}</span>}
      {a.locked ? (
        <span className="file-name">{name}</span>
      ) : (
        <button type="button" className="file-name" onClick={save} disabled={saving}>
          {name}
        </button>
      )}
      <span className="muted num">{formatBytes(Math.max(0, a.size - fileCipher.overhead))}</span>
      {!a.locked && (
        <button type="button" className="icon-only" onClick={save} disabled={saving} aria-label={`Download ${name}`}>
          {saving ? <Spinner size={13} /> : <Download size={14} />}
        </button>
      )}
      {canRemove && (
        <button type="button" className="icon-only" onClick={() => detail.deleteAttachment(a)} aria-label={`Remove ${name}`}>
          <Trash2 size={14} />
        </button>
      )}
    </li>
  );
}
