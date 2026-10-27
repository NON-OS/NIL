import { useEffect, useState } from 'react';
import useStore from '../../../state/useStore';
import createLiveDoc from '../../../actions/liveDoc/createLiveDoc';
import type DocItem from '../../../types/DocItem';
import type LiveDoc from '../../../types/LiveDoc';
import type LiveStatus from '../../../types/LiveStatus';

// Opens a doc for live editing while the editor shows it, and closes it (sending what's left and
// saving a version) when the editor moves on. A doc that moved to a new key opens afresh.
export default function useLiveDoc(doc: DocItem, onRekey: () => void) {
  const me = useStore((s) => s.me)!.id;
  const connected = useStore((s) => s.connected);
  const [live, setLive] = useState<LiveDoc | null>(null);
  const [status, setStatus] = useState<LiveStatus>({ state: 'saved', refused: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let made: LiveDoc | null = null;
    let unsubscribe = () => {};
    setError(null);
    createLiveDoc(doc, me, onRekey)
      .then((l) => {
        if (!alive) return void l.close();
        made = l;
        setStatus(l.status());
        unsubscribe = l.onStatus(setStatus);
        setLive(l);
      })
      .catch((err) => alive && setError(err?.message ?? 'This doc couldn’t be opened for editing.'));
    return () => {
      alive = false;
      unsubscribe();
      setLive(null);
      void made?.close();
    };
  }, [doc.id, doc.keyHash]);

  // someone saved a newer version: lay it on top
  useEffect(() => {
    if (live && doc.version > live.current().version) void live.rebase(doc);
  }, [doc.version, live]);

  useEffect(() => {
    if (connected) live?.reconnected();
  }, [connected, live]);

  // closing the tab with changes still on their way asks first
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (!live?.pending()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [live]);

  return { live, status, error };
}
