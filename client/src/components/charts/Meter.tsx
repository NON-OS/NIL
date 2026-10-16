import './charts.css';
import type { ReactNode } from 'react';

interface Props {
  label: ReactNode;
  value: number;
  total: number;
  color?: string;
  caption?: string;
}

export default function Meter({ label, value, total, color = 'var(--st-done)', caption }: Props) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="meter">
      <div className="meter-head">
        <span>{label}</span>
        <span className="muted num">{caption ?? `${value}/${total} · ${pct}%`}</span>
      </div>
      <div className="meter-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
