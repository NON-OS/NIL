import './Time.css';
import { Square } from 'lucide-react';
import useStore from '../../state/useStore';
import useTicker from '../../hooks/useTicker';
import timer from '../../actions/timer';
import detail from '../../actions/detail';
import router from '../../lib/router';
import clock from '../../lib/clock';
import taskKey from '../../lib/taskKey';

// Always in view while a timer runs, so it never gets forgotten overnight.
export default function RunningTimer() {
  const running = useStore((s) => s.timer);
  const task = useStore((s) => (running?.taskId ? s.tasks[running.taskId] : undefined));
  const now = useTicker(!!running);
  if (!running) return null;

  return (
    <div className="running-timer" role="timer" aria-live="off">
      <span className="dot" aria-hidden="true" />
      <button type="button" className="label" onClick={() => (task ? detail.open(task) : router.navigate('/time'))} title={task ? task.title : running.note || 'Timer'}>
        {task ? `${taskKey(task)} ${task.title}` : running.note || 'Timer running'}
      </button>
      <span className="num">{clock(now - running.startedAt)}</span>
      <button type="button" className="icon-only" onClick={timer.stop} aria-label="Stop the timer" title="Stop">
        <Square size={13} />
      </button>
    </div>
  );
}
