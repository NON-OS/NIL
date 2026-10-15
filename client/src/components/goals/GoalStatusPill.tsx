import meta from '../../lib/meta';
import type GoalStatus from '../../types/GoalStatus';

const TONE: Record<GoalStatus, { bg: string; fg: string }> = {
  on_track: { bg: 'var(--success-soft)', fg: 'var(--success)' },
  at_risk: { bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  off_track: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
  done: { bg: 'var(--accent-soft)', fg: 'var(--accent-text)' },
};

export default function GoalStatusPill({ status }: { status: GoalStatus }) {
  const tone = TONE[status];
  return (
    <span className="chip" style={{ background: tone.bg, color: tone.fg, borderColor: 'transparent' }}>
      <span className="dot" style={{ background: tone.fg }} />
      {meta.goalStatus[status]}
    </span>
  );
}
