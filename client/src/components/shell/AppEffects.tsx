import { useEffect } from 'react';
import useStore from '../../state/useStore';
import useShortcuts from '../../hooks/useShortcuts';
import store from '../../state/store';
import storage from '../../lib/storage';
import describeNotification from '../../lib/describeNotification';
import systemNotice from '../../lib/systemNotice';
import router from '../../lib/router';
import type InboxItem from '../../types/InboxItem';

// Side effects that belong to the whole app rather than any one screen.
export default function AppEffects() {
  const unread = useStore((s) => s.unread);
  const workspace = useStore((s) => s.workspace.name);
  useShortcuts();

  useEffect(() => {
    document.title = unread ? `(${unread}) ${workspace}` : workspace;
  }, [unread, workspace]);

  useEffect(() => {
    const onNotification = (e: Event) => {
      const n = (e as CustomEvent<InboxItem>).detail;
      if (document.visibilityState === 'visible' || !storage.get('desktop-notifications', false)) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const s = store.get();
      const actor = n.actorId ? s.users[n.actorId]?.name ?? 'Someone' : 'Someone';
      const task = n.taskId ? s.tasks[n.taskId] : undefined;
      // the body stays short and never includes comment text, since lock screens can show it
      const notice = systemNotice(n);
      const heading = notice ? notice.heading : `${actor} ${describeNotification(n)}`;
      const shown = new Notification(heading, { body: notice?.text || (task?.title ?? n.data.title ?? ''), tag: `nonos-${n.id}`, silent: false });
      shown.onclick = () => {
        window.focus();
        if (task) router.setParam('task', String(task.number));
        else if (n.type === 'proposal') router.navigate('/votes');
        else if (n.type === 'plan_ending') router.navigate('/settings?tab=plan');
        shown.close();
      };
    };
    window.addEventListener('nonos:notification', onNotification);
    return () => window.removeEventListener('nonos:notification', onNotification);
  }, []);

  return null;
}
