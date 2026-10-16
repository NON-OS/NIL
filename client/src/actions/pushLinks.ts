import store from '../state/store';
import toast from '../state/toast';
import router from '../lib/router';
import detail from './detail';
import archive from './archive';

// A notification names its task by id only, since a private task's push carries nothing else.
// An older finished task may still be waiting in the archive, so it's fetched before giving up.
async function open(taskId: string | null) {
  if (!taskId) return router.navigate('/inbox');
  if (!store.get().tasks[taskId]) await archive.find([taskId]).catch(() => {});
  const task = store.get().tasks[taskId];
  if (task) detail.open(task);
  else toast.show('That task isn’t available any more.', { tone: 'error' });
}

// Opens the task a clicked notification is about: from the link the service worker opened
// (?open-task=), or from its message to a Nil tab that was already open. Returns a cleanup.
export default function followPushLinks() {
  const linked = router.param('open-task');
  if (linked !== null) {
    router.setParam('open-task', null, { replace: true });
    void open(linked || null);
  }
  const onMessage = (e: MessageEvent) => {
    if (e.data?.type === 'nil:open') void open(typeof e.data.taskId === 'string' ? e.data.taskId : null);
  };
  navigator.serviceWorker?.addEventListener('message', onMessage);
  return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
}
