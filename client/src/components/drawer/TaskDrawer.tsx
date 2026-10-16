import './TaskDrawer.css';
import { useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { SearchX } from 'lucide-react';
import DrawerHeader from './DrawerHeader';
import TitleEditor from './TitleEditor';
import PropertyGrid from './PropertyGrid';
import BountyPanel from '../bounty/BountyPanel';
import DescriptionEditor from './DescriptionEditor';
import Checklist from './Checklist';
import Attachments from './Attachments';
import Timeline from './Timeline';
import LockedTask from './LockedTask';
import useStore from '../../state/useStore';
import detail from '../../actions/detail';

export default function TaskDrawer({ number }: { number: number }) {
  const tasks = useStore((s) => s.tasks);
  const task = useMemo(() => Object.values(tasks).find((t) => t.number === number), [tasks, number]);
  const taskId = task?.id;

  useEffect(() => {
    if (!taskId) return;
    detail.load(taskId);
    return () => detail.clear();
  }, [taskId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.closest('.drawer') && ['INPUT', 'TEXTAREA'].includes(el.tagName)) return;
      detail.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return createPortal(
    <>
      <div className="drawer-scrim" onClick={detail.close} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={task ? task.title : 'Task'}>
        {task ? (
          <>
            <DrawerHeader task={task} />
            <div className="drawer-body">
              {task.locked ? (
                <>
                  <LockedTask task={task} />
                  <PropertyGrid task={task} />
                  <Attachments task={task} />
                </>
              ) : (
                <>
                  <TitleEditor task={task} />
                  <PropertyGrid task={task} />
                  <BountyPanel task={task} />
                  <DescriptionEditor task={task} />
                  <Checklist task={task} />
                  <Attachments task={task} />
                  <Timeline taskId={task.id} />
                </>
              )}
            </div>
          </>
        ) : (
          <div className="drawer-missing">
            <SearchX size={28} />
            <p>This task was deleted or never existed.</p>
            <button type="button" className="btn" onClick={detail.close}>
              Close
            </button>
          </div>
        )}
      </aside>
    </>,
    document.body,
  );
}
