import type Status from '../../types/Status';

const COLOR: Record<Status, string> = {
  backlog: 'var(--st-backlog)',
  todo: 'var(--st-todo)',
  in_progress: 'var(--st-progress)',
  in_review: 'var(--st-review)',
  done: 'var(--st-done)',
  canceled: 'var(--st-canceled)',
};

// A ring that fills as work moves along: empty, half, three-quarters, done.
export default function StatusIcon({ status, size = 14 }: { status: Status; size?: number }) {
  const color = COLOR[status];
  const pie = (fraction: number) => {
    const angle = fraction * 2 * Math.PI;
    const x = 7 + 3.5 * Math.sin(angle);
    const y = 7 - 3.5 * Math.cos(angle);
    return `M7 7 L7 3.5 A3.5 3.5 0 ${fraction > 0.5 ? 1 : 0} 1 ${x} ${y} Z`;
  };
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" style={{ flex: 'none' }}>
      {status === 'backlog' && <circle cx="7" cy="7" r="5.5" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="2.2 2" />}
      {status === 'todo' && <circle cx="7" cy="7" r="5.5" fill="none" stroke={color} strokeWidth="1.5" />}
      {(status === 'in_progress' || status === 'in_review') && (
        <>
          <circle cx="7" cy="7" r="5.5" fill="none" stroke={color} strokeWidth="1.5" />
          <path d={pie(status === 'in_progress' ? 0.5 : 0.75)} fill={color} />
        </>
      )}
      {status === 'done' && (
        <>
          <circle cx="7" cy="7" r="6.25" fill={color} />
          <path d="M4.3 7.2l1.9 1.9 3.6-3.8" fill="none" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {status === 'canceled' && (
        <>
          <circle cx="7" cy="7" r="6.25" fill={color} />
          <path d="M5 5l4 4M9 5l-4 4" stroke="var(--surface)" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
