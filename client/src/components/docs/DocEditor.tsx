import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Eye, History, Pencil, Printer, ShieldCheck, Sparkles, Trash2, Users } from 'lucide-react';
import Markdown from '../ui/Markdown';
import ConfirmButton from '../ui/ConfirmButton';
import ShareDocModal from './ShareDocModal';
import DocHistory from './DocHistory';
import DraftModal from './DraftModal';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import docs from '../../actions/docs';
import saveBlob from '../../lib/saveBlob';
import type DocItem from '../../types/DocItem';
import isAdminUser from '../../lib/isAdmin';

type Status = 'saved' | 'dirty' | 'saving' | 'conflict';

interface Props {
  doc: DocItem;
  onChange: (doc: DocItem) => void;
  onDeleted: () => void;
  onBack: () => void;
  onReload: () => void;
}

// Typing saves on its own after a short pause. Each save encrypts in the browser first,
// so what leaves this tab is already ciphertext.
export default function DocEditor({ doc, onChange, onDeleted, onBack, onReload }: Props) {
  const me = useStore((s) => s.me)!;
  const aiOn = useStore((s) => s.ai);
  const [drafting, setDrafting] = useState(false);
  const [title, setTitle] = useState(doc.title);
  const [body, setBody] = useState(doc.body ?? '');
  const [status, setStatus] = useState<Status>('saved');
  const [preview, setPreview] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [history, setHistory] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef(doc);
  latest.current = doc;
  const canManage = doc.createdBy === me.id || isAdminUser(me);

  useEffect(() => {
    if (status === 'dirty' || status === 'saving') return;
    setTitle(doc.title);
    setBody(doc.body ?? '');
  }, [doc.id, doc.version]);

  const save = useCallback(
    async (nextTitle: string, nextBody: string) => {
      setStatus('saving');
      try {
        const saved = await docs.save(latest.current, nextTitle, nextBody);
        onChange(saved);
        setStatus('saved');
      } catch (err: any) {
        if (err?.status === 409) setStatus('conflict');
        else {
          setStatus('dirty');
          toast.error(err);
        }
      }
    },
    [onChange],
  );

  const edit = (nextTitle: string, nextBody: string) => {
    setTitle(nextTitle);
    setBody(nextBody);
    setStatus('dirty');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(nextTitle, nextBody), 1200);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  // Keep my text: fetch their version number, then save mine on top of it.
  const overwrite = async () => {
    try {
      const fresh = await docs.open(doc.id);
      latest.current = fresh;
      await save(title, body);
    } catch (err) {
      toast.error(err);
    }
  };

  const label = { saved: 'Encrypted · saved', dirty: 'Unsaved', saving: 'Encrypting…', conflict: 'Conflict' }[status];

  return (
    <section className="doc-editor" aria-label="Doc">
      <div className="doc-toolbar">
        <button type="button" className="btn btn-sm btn-ghost only-mobile" onClick={onBack} aria-label="Back to docs">
          <ArrowLeft />
        </button>
        <span className="doc-status" aria-live="polite">
          <ShieldCheck /> {label}
        </span>
        <button type="button" className="btn btn-sm" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
          {preview ? <Pencil /> : <Eye />} {preview ? 'Write' : 'Preview'}
        </button>
        {aiOn && (
          <button type="button" className="btn btn-sm" onClick={() => setDrafting(true)}>
            <Sparkles /> Draft
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={() => setSharing(true)}>
          <Users /> {doc.audience === 'team' ? 'Team' : `${doc.readers.length}`}
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setHistory(true)} aria-label="Version history" title="Version history">
          <History />
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => saveBlob(new Blob([`# ${title}\n\n${body}\n`], { type: 'text/markdown' }), `${(title || 'doc').replace(/[^\w-]+/g, '-').toLowerCase()}.md`)} aria-label="Download as Markdown" title="Download as Markdown (decrypted)">
          <Download />
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.print()} aria-label="Print or save as PDF" title="Print or save as PDF">
          <Printer />
        </button>
        {canManage && (
          <ConfirmButton className="btn btn-sm btn-ghost" onConfirm={() => docs.remove(doc).then(onDeleted).catch(toast.error)} confirmLabel="Delete for everyone?">
            <Trash2 />
          </ConfirmButton>
        )}
      </div>
      {status === 'conflict' && (
        <div className="doc-conflict" role="alert">
          <span>Someone saved a newer version while you were typing.</span>
          <button type="button" className="btn btn-sm" onClick={() => (setStatus('saved'), onReload())}>
            Load theirs
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={overwrite}>
            Keep mine
          </button>
        </div>
      )}
      <div className="doc-body">
        <div>
          <input className="doc-title" value={title} onChange={(e) => edit(e.target.value, body)} placeholder="Untitled" aria-label="Title" maxLength={200} />
          {preview ? <Markdown text={body || '_Nothing written yet._'} /> : <textarea className="doc-text" value={body} onChange={(e) => edit(title, e.target.value)} placeholder="Start writing. Markdown works: # headings, **bold**, - lists, [links](https://…)" aria-label="Doc text" />}
        </div>
      </div>
      {sharing && <ShareDocModal doc={doc} canManage={canManage} onClose={() => setSharing(false)} onDone={onReload} />}
      {drafting && <DraftModal title={title} body={body} onClose={() => setDrafting(false)} onDraft={(text) => edit(title, body.trim() ? `${body.trimEnd()}\n\n${text}` : text)} />}
      {history && <DocHistory doc={doc} onClose={() => setHistory(false)} onRestore={(t, b) => edit(t, b)} />}
    </section>
  );
}
