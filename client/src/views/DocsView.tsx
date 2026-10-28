import '../components/docs/Docs.css';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import Spinner from '../components/ui/Spinner';
import DocsLocked from '../components/docs/DocsLocked';
import DocList from '../components/docs/DocList';
import KeyNotice from '../components/keys/KeyNotice';
import useStore from '../state/useStore';
import useRoute from '../hooks/useRoute';
import toast from '../state/toast';
import docs from '../actions/docs';
import router from '../lib/router';
import socket from '../realtime/socket';
import cx from '../lib/cx';
import type DocItem from '../types/DocItem';
import type { DocTemplate } from '../lib/docState/docTemplates';
import pendingImport from '../state/pendingImport';
import DocErrorBoundary from '../components/docs/DocErrorBoundary';

// the editor is the heavy part, so the list shows while it loads
const DocEditor = lazy(() => import('../components/docs/DocEditor'));
const LIST_PAUSE_MS = 1500;

export default function DocsView() {
  const unlocked = useStore((s) => s.docsUnlocked);
  const revision = useStore((s) => s.docsRev);
  const changed = useStore((s) => s.docsChanged);
  // a newly confirmed key is a chance to hand team docs over
  const keysRevision = useStore((s) => s.keysRev);
  const { segments } = useRoute();
  const currentId = segments[1];
  const [list, setList] = useState<{ docs: DocItem[]; waiting: { id: string; createdBy: string | null; updatedAt: number }[] } | null>(null);
  const [open, setOpen] = useState<DocItem | null>(null);

  const refresh = useCallback(async () => {
    const next = await docs.list();
    setList(next);
    // quietly hand team docs to teammates whose keys this person has confirmed since
    docs.shareWithTeam(next.docs).catch(() => {});
  }, []);

  // saves come every few seconds while people type, so changes in a burst refresh the list once
  useEffect(() => {
    if (!unlocked) return;
    const timer = setTimeout(() => refresh().catch(toast.error), revision ? LIST_PAUSE_MS : 0);
    return () => clearTimeout(timer);
  }, [unlocked, revision, keysRevision, refresh]);

  const load = useCallback(() => {
    if (!unlocked || !currentId) return setOpen(null);
    docs.open(currentId).then(setOpen).catch(() => {
      setOpen(null);
      router.navigate('/docs');
    });
  }, [unlocked, currentId]);
  useEffect(load, [load]);

  // someone saved a newer version of the open doc, or shared it with more people: the open
  // editor lays it on top of what's on screen. Changes to other docs leave it alone.
  useEffect(() => {
    if (!revision || !open || (changed !== null && changed !== open.id)) return;
    docs.open(open.id).then((fresh) => (fresh.version !== open.version || fresh.readers.join() !== open.readers.join()) && setOpen(fresh)).catch(() => {});
  }, [revision]);

  useEffect(() => {
    socket.viewing(currentId ?? null);
    return () => socket.viewing(null);
  }, [currentId]);

  const create = async (template?: DocTemplate) => {
    try {
      const doc = await docs.create({ title: template?.title ?? '', markdown: template?.markdown, audience: 'team' });
      await refresh();
      router.navigate(`/docs/${doc.id}`);
    } catch (err) {
      toast.error(err);
    }
  };

  // a doc named after the file, which its editor fills in once it opens
  const importDoc = async (file: File) => {
    try {
      const doc = await docs.create({ title: file.name.replace(/\.[^.]+$/, '').slice(0, 200), audience: 'team' });
      pendingImport.set(doc.id, file);
      await refresh();
      router.navigate(`/docs/${doc.id}`);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="main" style={{ display: 'flex', flexDirection: 'column' }}>
      <ViewHeader title="Docs" icon={<FileText size={17} />} subtitle="End-to-end encrypted" />
      {!unlocked ? (
        <DocsLocked />
      ) : !list ? (
        <div className="docs-locked">
          <Spinner size={20} />
        </div>
      ) : (
        <>
          <KeyNotice reason="team docs" />
          <div className={cx('docs', currentId && 'has-doc')}>
            <DocList docs={list.docs} waiting={list.waiting} current={currentId} onOpen={(id) => router.navigate(`/docs/${id}`)} onNew={create} onImport={importDoc} />
            {open ? (
              <Suspense
                fallback={
                  <div className="docs-locked">
                    <Spinner size={20} />
                  </div>
                }
              >
                <DocErrorBoundary key={open.id} onReload={load} onBack={() => router.navigate('/docs')}>
                  <DocEditor
                    key={open.id}
                    doc={open}
                    onTitle={(title) => setList((l) => l && { ...l, docs: l.docs.map((d) => (d.id === open.id && d.title !== (title || 'Untitled') ? { ...d, title: title || 'Untitled' } : d)) })}
                    onDeleted={() => {
                      router.navigate('/docs');
                      refresh();
                    }}
                    onBack={() => router.navigate('/docs')}
                    onReload={() => {
                      load();
                      refresh();
                    }}
                  />
                </DocErrorBoundary>
              </Suspense>
            ) : (
              <div className="docs-locked">
                <p className="muted">{list.docs.length ? 'Pick a doc, or start a new one.' : 'Start your first encrypted doc with the + button.'}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
