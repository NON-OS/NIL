import '../components/docs/Docs.css';
import { useCallback, useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import Spinner from '../components/ui/Spinner';
import DocsLocked from '../components/docs/DocsLocked';
import DocList from '../components/docs/DocList';
import DocEditor from '../components/docs/DocEditor';
import KeyNotice from '../components/keys/KeyNotice';
import useStore from '../state/useStore';
import useRoute from '../hooks/useRoute';
import toast from '../state/toast';
import docs from '../actions/docs';
import router from '../lib/router';
import socket from '../realtime/socket';
import cx from '../lib/cx';
import type DocItem from '../types/DocItem';

export default function DocsView() {
  const unlocked = useStore((s) => s.docsUnlocked);
  const revision = useStore((s) => s.docsRev);
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

  useEffect(() => {
    if (unlocked) refresh().catch(toast.error);
  }, [unlocked, revision, keysRevision, refresh]);

  const load = useCallback(() => {
    if (!unlocked || !currentId) return setOpen(null);
    docs.open(currentId).then(setOpen).catch(() => {
      setOpen(null);
      router.navigate('/docs');
    });
  }, [unlocked, currentId]);
  useEffect(load, [load]);

  // someone else saved: pick up their version unless we're mid-edit (the editor decides)
  useEffect(() => {
    if (revision && open) docs.open(open.id).then((fresh) => fresh.version !== open.version && setOpen(fresh)).catch(() => {});
  }, [revision]);

  useEffect(() => {
    socket.viewing(currentId ?? null);
    return () => socket.viewing(null);
  }, [currentId]);

  const create = async () => {
    try {
      const doc = await docs.create({ title: 'Untitled', body: '', audience: 'team' });
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
            <DocList docs={list.docs} waiting={list.waiting} current={currentId} onOpen={(id) => router.navigate(`/docs/${id}`)} onNew={create} />
            {open ? (
              <DocEditor
                key={open.id}
                doc={open}
                onChange={(doc) => {
                  setOpen(doc);
                  setList((l) => l && { ...l, docs: l.docs.map((d) => (d.id === doc.id ? { ...doc, body: d.body } : d)) });
                }}
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
