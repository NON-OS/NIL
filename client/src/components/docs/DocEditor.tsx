import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Eye, History, Pencil, Printer, ShieldCheck, Sparkles, Trash2, Users } from 'lucide-react';
import Markdown from '../ui/Markdown';
import ConfirmButton from '../ui/ConfirmButton';
import DocMoreMenu from './DocMoreMenu';
import ShareDocModal from './ShareDocModal';
import DocHistory from './DocHistory';
import DraftModal from './DraftModal';
import useStore from '../../state/useStore';
import useMediaQuery from '../../hooks/useMediaQuery';
import toast from '../../state/toast';
import docs from '../../actions/docs';
import saveBlob from '../../lib/saveBlob';
import type DocItem from '../../types/DocItem';
import isAdminUser from '../../lib/isAdmin';
import media from '../../lib/media';

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
  const users = useStore((s) => s.users);
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
  const compact = useMediaQuery(media.touchOrNarrow);
  // text nobody on the team can be shown to have written stays read-only until it's re-keyed
  const readOnly = doc.warning === 'unverified';

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
    if (readOnly) return;
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

  const label = readOnly ? 'Not verified' : { saved: 'Encrypted · saved', dirty: 'Unsaved', saving: 'Encrypting…', conflict: 'Conflict' }[status];
  const audience = doc.audience === 'team' ? 'Team' : `${doc.readers.length} ${doc.readers.length === 1 ? 'reader' : 'readers'}`;
  const download = () => saveBlob(new Blob([`# ${title}\n\n${body}\n`], { type: 'text/markdown' }), `${(title || 'doc').replace(/[^\w-]+/g, '-').toLowerCase()}.md`);
  const remove = () => docs.remove(doc).then(onDeleted).catch(toast.error);

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
        <button type="button" className="btn btn-sm" onClick={() => setSharing(true)} aria-label={`Share, ${audience}`}>
          <Users /> {audience}
        </button>
        {compact ? (
          <DocMoreMenu onHistory={() => setHistory(true)} onDownload={download} onPrint={() => window.print()} onDelete={canManage ? remove : undefined} />
        ) : (
          <>
            <button type="button" className="btn btn-sm btn-ghost tip" onClick={() => setHistory(true)} aria-label="Version history">
              <History />
            </button>
            <button type="button" className="btn btn-sm btn-ghost tip" onClick={download} aria-label="Download as Markdown (decrypted)">
              <Download />
            </button>
            <button type="button" className="btn btn-sm btn-ghost tip" onClick={() => window.print()} aria-label="Print or save as PDF">
              <Printer />
            </button>
            {canManage && (
              <ConfirmButton className="btn btn-sm btn-ghost doc-delete tip tip-end" onConfirm={remove} confirmLabel="Delete for everyone?" label="Delete doc">
                <Trash2 />
              </ConfirmButton>
            )}
          </>
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
      {doc.warning === 'unverified' && (
        <div className="doc-conflict" role="alert">
          <span>Nil can’t confirm a teammate wrote this version: no signature on it checks out against the keys you know. The server may have changed it, so don’t rely on it. {canManage ? 'To keep it, open Who can read this and save: the doc gets a new key and your signature.' : 'Its creator or an admin can re-key it.'} If someone’s key changed recently, check it first.</span>
        </div>
      )}
      {doc.warning === 'rollback' && (
        <div className="doc-conflict" role="alert">
          <span>This is an older version than one you’ve already opened here. The server may be holding back newer changes.</span>
        </div>
      )}
      {doc.olderFormat && !readOnly && (
        <div className="doc-conflict">
          <span>This version was saved in an older format that can’t show who it’s for, so Nil won’t share it with new teammates on its own. Saving it again updates it.</span>
        </div>
      )}
      {doc.oldKey && (
        <div className="doc-conflict">
          <span>
            {users[doc.updatedBy ?? '']?.name ?? 'A former member'} signed this version with an earlier key, <span className="mono">{doc.oldKey}</span>, from before their key changed.
          </span>
        </div>
      )}
      <div className="doc-body">
        <div>
          <input className="doc-title" value={title} onChange={(e) => edit(e.target.value, body)} placeholder="Untitled" aria-label="Title" maxLength={200} readOnly={readOnly} />
          {preview ? <Markdown text={body || '_Nothing written yet._'} /> : <textarea className="doc-text" value={body} onChange={(e) => edit(title, e.target.value)} placeholder="Start writing. Markdown works: # headings, **bold**, - lists, [links](https://…)" aria-label="Doc text" readOnly={readOnly} />}
        </div>
      </div>
      {sharing && <ShareDocModal doc={doc} canManage={canManage} onClose={() => setSharing(false)} onDone={onReload} />}
      {drafting && <DraftModal title={title} body={body} onClose={() => setDrafting(false)} onDraft={(text) => edit(title, body.trim() ? `${body.trimEnd()}\n\n${text}` : text)} />}
      {history && <DocHistory doc={doc} onClose={() => setHistory(false)} onRestore={(t, b) => edit(t, b)} />}
    </section>
  );
}
