import { useEffect } from 'react';
import useStore from '../../state/useStore';
import useShortcuts from '../../hooks/useShortcuts';
import store from '../../state/store';
import storage from '../../lib/storage';
import describeNotification from '../../lib/describeNotification';
import systemNotice from '../../lib/systemNotice';
import router from '../../lib/router';
import push from '../../actions/push';
import followPushLinks from '../../actions/pushLinks';
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
    push.refresh().catch(() => {});
    return followPushLinks();
  }, []);

  useEffect(() => {
    const onNotification = (e: Event) => {
      const n = (e as CustomEvent<InboxItem>).detail;
      if (document.visibilityState === 'visible' || !storage.get('desktop-notifications', false)) return;
      // with push on, the service worker shows it, so it isn't shown twice
      if (push.isOnHere()) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const s = store.get();
      const actor = n.actorId ? s.users[n.actorId]?.name ?? 'Someone' : 'Someone';
      const task = n.taskId ? s.tasks[n.taskId] : undefined;
      // The body stays short and never includes comment text, since lock screens can show it. A
      // private task's title was decrypted in this tab and must not leave it: the OS keeps
      // notifications in its own history, so those only say a private task changed.
      const notice = systemNotice(n);
      const heading = notice ? notice.heading : `${actor} ${describeNotification(n)}`;
      const body = notice?.text || (task?.private ? 'A private task' : task?.title ?? n.data.title ?? '');
      const shown = new Notification(heading, { body, tag: `nonos-${n.id}`, silent: false });
      shown.onclick = () => {
        window.focus();
        if (task) router.setParam('task', String(task.number));
        else if (n.type === 'proposal') router.navigate('/votes');
        else if (n.type === 'plan_ending') router.navigate('/settings?tab=plan');
        else if (n.type === 'billing_stalled') router.navigate(n.data.code === 'bounty_pending' ? '/bounties' : '/settings?tab=plan');
        else if (n.type === 'sign_in_reset') router.navigate('/settings?tab=team');
        shown.close();
      };
    };
    window.addEventListener('nonos:notification', onNotification);
    return () => window.removeEventListener('nonos:notification', onNotification);
  }, []);

  return null;
}
