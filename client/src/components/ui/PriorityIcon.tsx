import type Priority from '../../types/Priority';

// Signal bars for low to high; urgent gets its own unmistakable mark.
export default function PriorityIcon({ priority, size = 14 }: { priority: Priority; size?: number }) {
  if (priority === 4) {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" style={{ flex: 'none' }}>
        <rect x="1" y="1" width="12" height="12" rx="3" fill="var(--p-urgent)" />
        <path d="M7 3.8v4" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="7" cy="10.2" r="1" fill="#fff" />
      </svg>
    );
  }
  if (priority === 0) {
    return (
      <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" style={{ flex: 'none' }}>
        {[2.5, 6, 9.5].map((x) => (
          <rect key={x} x={x} y="6.4" width="2.2" height="1.4" rx="0.7" fill="var(--faint)" />
        ))}
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" style={{ flex: 'none' }}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={2 + i * 3.6} y={10 - i * 3} width="2.4" height={2 + i * 3} rx="0.8" fill={i < priority ? 'var(--ink-2)' : 'var(--line-strong)'} />
      ))}
    </svg>
  );
}
