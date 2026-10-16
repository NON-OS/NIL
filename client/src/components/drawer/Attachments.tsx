import { useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import Spinner from '../ui/Spinner';
import FileRow from './FileRow';
import SealedFileRow from './SealedFileRow';
import useStore from '../../state/useStore';
import detail from '../../actions/detail';
import type Task from '../../types/Task';
import isAdminUser from '../../lib/isAdmin';

function hint(task: Task) {
  if (task.sealed) return 'Drop files here or use Attach. Each one is encrypted in your browser first, its name too.';
  // a private task from before encryption takes files once its owner's next unlock has sealed it
  if (task.private) return 'Unlock to encrypt this private task, then attach files.';
  return 'Drop files here or use Attach. Files stay on your server.';
}

export default function Attachments({ task }: { task: Task }) {
  const attachments = useStore((s) => (s.detail?.taskId === task.id ? s.detail.attachments : null));
  const meId = useStore((s) => s.me?.id);
  const isAdmin = useStore((s) => isAdminUser(s.me));
  const [uploading, setUploading] = useState(0);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const canAttach = !task.locked && (!task.private || Boolean(task.sealed));

  const upload = async (files: FileList | File[]) => {
    const list = [...files];
    setUploading((n) => n + list.length);
    for (const file of list) {
      await detail.upload(task.id, file);
      setUploading((n) => n - 1);
    }
  };

  // a task this tab can't open lists its files as locked, and says nothing when it has none
  if (task.locked && !attachments?.length) return null;

  return (
    <section
      className={`drawer-section dropzone${over ? ' over' : ''}`}
      onDragOver={(e) => {
        if (canAttach && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (canAttach && e.dataTransfer.files.length) upload(e.dataTransfer.files);
      }}
    >
      <div className="section-head">
        <h3>Files {attachments && attachments.length > 0 && <span className="muted num">{attachments.length}</span>}</h3>
        {canAttach && (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current?.click()}>
              {uploading ? <Spinner size={13} /> : <Paperclip />}
              Attach
            </button>
            <input ref={input} type="file" multiple hidden onChange={(e) => e.target.files && upload(e.target.files)} />
          </>
        )}
      </div>
      {attachments && attachments.length > 0 ? (
        <ul className="attachments">
          {attachments.map((a) => {
            const canRemove = a.uploaderId === meId || isAdmin;
            return a.sealed ? <SealedFileRow key={a.id} task={task} attachment={a} canRemove={canRemove} /> : <FileRow key={a.id} attachment={a} canRemove={canRemove} />;
          })}
        </ul>
      ) : (
        <p className="hint">{hint(task)}</p>
      )}
    </section>
  );
}
