import './Time.css';
import { Play, Square } from 'lucide-react';
import useStore from '../../state/useStore';
import useTicker from '../../hooks/useTicker';
import timer from '../../actions/timer';
import clock from '../../lib/clock';

export default function TimerButton({ taskId }: { taskId: string }) {
  const running = useStore((s) => s.timer);
  const mine = running?.taskId === taskId;
  const now = useTicker(mine);

  if (mine) {
    return (
      <button type="button" className="icon-btn timing" onClick={timer.stop} title="Stop the timer">
        <Square size={12} /> {clock(now - running.startedAt)}
      </button>
    );
  }
  return (
    <button type="button" className="icon-btn" onClick={() => timer.start(taskId)} title={running ? 'Switch the timer to this task' : 'Start a timer for this task'}>
      <Play />
    </button>
  );
}
