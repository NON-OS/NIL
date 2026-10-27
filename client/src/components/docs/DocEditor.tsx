import './Docs.css';
import './editor/Editor.css';
import './editor/Side.css';
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { ArrowLeft, ListTree, MessageSquare, Sparkles, Users } from 'lucide-react';
import DocMoreMenu from './DocMoreMenu';
import ShareDocModal from './ShareDocModal';
import DocHistory from './DocHistory';
import DraftModal from './DraftModal';
import DocBanners from './DocBanners';
import RichEditor from './editor/RichEditor';
import FormatBar from './editor/FormatBar';
import CommentsPanel from './editor/CommentsPanel';
import OutlinePanel from './editor/OutlinePanel';
import DocPresence from './editor/DocPresence';
import DocStatusBadge from './editor/DocStatusBadge';
import LinkEditor from './editor/LinkEditor';
import useLiveDoc from './editor/useLiveDoc';
import useYText from './editor/useYText';
import docComments from './editor/docComments';
import restoreVersion from './editor/restoreVersion';
import editorMarkdown from '../../lib/docConvert/editorMarkdown';
import useDocAttach from './editor/useDocAttach';
import docExport from './editor/docExport';
import docImport from './editor/docImport';
import pendingImport from '../../state/pendingImport';
import importMarkdown from '../../lib/docConvert/importMarkdown';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import docs from '../../actions/docs';
import isAdminUser from '../../lib/isAdmin';
import type DocItem from '../../types/DocItem';

interface Props {
  doc: DocItem;
  onDeleted: () => void;
  onBack: () => void;
  onReload: () => void;
  // the title as it's typed, so the list beside the doc keeps up
  onTitle: (title: string) => void;
}

// One doc, open for live editing with everyone else who has it open. Every change is signed and
// encrypted in this tab before it leaves; the server passes on and stores only ciphertext.
export default function DocEditor({ doc, onDeleted, onBack, onReload, onTitle }: Props) {
  const me = useStore((s) => s.me)!;
  const aiOn = useStore((s) => s.ai);
  const { live, status, error } = useLiveDoc(doc, onReload);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [title, setTitle] = useYText(live?.ydoc.getText('title') ?? null);
  const [panel, setPanel] = useState<'comments' | 'outline' | null>(null);
  const [thread, setThread] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ from: number; to: number; quote: string } | null>(null);
  const [modal, setModal] = useState<'link' | 'share' | 'history' | 'draft' | null>(null);
  const canManage = doc.createdBy === me.id || isAdminUser(me);
  const attach = useDocAttach(doc.id, editor);
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (live) onTitle(title);
  }, [live, title]);
  const readOnly = doc.warning === 'unverified' || status.state === 'readonly';
  const audience = doc.audience === 'team' ? 'Team' : `${doc.readers.length} ${doc.readers.length === 1 ? 'reader' : 'readers'}`;

  const startComment = () => {
    if (!editor || readOnly) return;
    const { from, to } = editor.state.selection;
    if (from === to) return toast.show('Select the words you want to comment on first.');
    setDraft({ from, to, quote: editor.state.doc.textBetween(from, to, ' ').slice(0, 300) });
    setPanel('comments');
  };
  const sendComment = (text: string) => {
    if (!editor || !live || !draft) return;
    const id = docComments.start(live.ydoc, me.id, draft.quote, text);
    editor.chain().setTextSelection({ from: draft.from, to: draft.to }).setMark('comment', { thread: id }).run();
    setDraft(null);
    setThread(id);
  };

  const exportAs = (format: 'docx' | 'md') => editor && docExport(editor, title, format).catch(toast.error);
  const importFile = async (file: File) => {
    if (!editor) return;
    try {
      const named = await docImport(editor, doc.id, file);
      if (!title.trim() || title === file.name.replace(/\.[^.]+$/, '')) setTitle((named || file.name.replace(/\.[^.]+$/, '')).slice(0, 200));
    } catch (err) {
      toast.error(err);
    }
  };
  // a doc made from a file picks it up as soon as its editor is ready
  useEffect(() => {
    const file = editor && !readOnly ? pendingImport.take(doc.id) : null;
    if (file) void importFile(file);
  }, [editor]);
  const remove = () => docs.remove(doc).then(onDeleted).catch(toast.error);
  const toggle = (p: 'comments' | 'outline') => setPanel((cur) => (cur === p ? null : p));

  if (error) return <DocBanners doc={doc} status={status} canManage={canManage} error={error} />;
  if (!live) {
    return (
      <section className="doc-editor docs-locked" aria-label="Doc" aria-busy="true">
        <Spinner size={20} />
      </section>
    );
  }

  return (
    <section className={`doc-editor${panel ? ' has-side' : ''}`} aria-label="Doc">
      <div className="doc-toolbar">
        <button type="button" className="btn btn-sm btn-ghost only-mobile" onClick={onBack} aria-label="Back to docs">
          <ArrowLeft />
        </button>
        <DocStatusBadge status={status} />
        <DocPresence awareness={live.awareness} />
        {aiOn && !readOnly && (
          <button type="button" className="btn btn-sm" onClick={() => setModal('draft')}>
            <Sparkles /> Draft
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={() => toggle('comments')} aria-pressed={panel === 'comments'} aria-label="Comments">
          <MessageSquare />
        </button>
        <button type="button" className="btn btn-sm only-wide" onClick={() => toggle('outline')} aria-pressed={panel === 'outline'} aria-label="Outline">
          <ListTree />
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setModal('share')} aria-label={`Share, ${audience}`}>
          <Users /> {audience}
        </button>
        <DocMoreMenu onHistory={() => setModal('history')} onWord={() => exportAs('docx')} onMarkdown={() => exportAs('md')} onPrint={() => window.print()} onImport={readOnly ? undefined : () => importInput.current?.click()} onDelete={canManage ? remove : undefined} />
      </div>
      {editor && !readOnly && <FormatBar editor={editor} onLink={() => setModal('link')} onPick={attach.pick} />}
      {attach.uploading && (
        <div className="doc-uploading" role="status">
          Encrypting {attach.uploading.name}… <span className="num">{Math.round(attach.uploading.progress * 100)}%</span>
        </div>
      )}
      <input {...attach.inputProps} />
      <input ref={importInput} type="file" hidden aria-hidden tabIndex={-1} accept=".docx,.md,.markdown,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
      <DocBanners doc={doc} status={status} canManage={canManage} error={null} />
      <div className="doc-main">
        <div className="doc-body">
          <div>
            <input className="doc-title" value={title} onChange={(e) => setTitle(e.target.value.slice(0, 200))} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), editor?.commands.focus('start'))} placeholder="Untitled" aria-label="Title" maxLength={200} readOnly={readOnly} />
            <RichEditor live={live} readOnly={readOnly} onEditor={setEditor} onLink={() => setModal('link')} onComment={startComment} onPick={attach.pick} onFiles={(files) => void attach.insert(files)} />
          </div>
        </div>
        {editor && panel === 'comments' && <CommentsPanel editor={editor} ydoc={live.ydoc} active={thread} onActive={setThread} onClose={() => setPanel(null)} draft={draft && { quote: draft.quote, onSend: sendComment, onCancel: () => setDraft(null) }} />}
        {editor && panel === 'outline' && <OutlinePanel editor={editor} onClose={() => setPanel(null)} />}
      </div>
      {modal === 'link' && editor && <LinkEditor editor={editor} onClose={() => setModal(null)} />}
      {modal === 'share' && <ShareDocModal doc={live.current()} canManage={canManage} onClose={() => setModal(null)} onDone={onReload} />}
      {modal === 'draft' && editor && <DraftModal title={title} body={editorMarkdown(editor)} onClose={() => setModal(null)} onDraft={(text) => editor.chain().focus('end').insertContent(importMarkdown(text).content ?? []).run()} />}
      {modal === 'history' && editor && <DocHistory doc={live.current()} onClose={() => setModal(null)} onRestore={(t, b) => restoreVersion(editor, setTitle, t, b)} />}
    </section>
  );
}
