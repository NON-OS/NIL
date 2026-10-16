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
      <button type="button" className="icon-btn tip timing" onClick={timer.stop} aria-label="Stop timer">
        <Square size={12} /> {clock(now - running.startedAt)}
      </button>
    );
  }
  return (
    <button type="button" className="icon-btn tip" onClick={() => timer.start(taskId)} aria-label={running ? 'Move timer here' : 'Start timer'}>
      <Play />
    </button>
  );
}
