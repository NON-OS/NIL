import './charts.css';
import { useId, type ReactNode } from 'react';

interface Props {
  label: ReactNode;
  value: number;
  total: number;
  color?: string;
  caption?: string;
}

export default function Meter({ label, value, total, color = 'var(--st-done)', caption }: Props) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  const id = useId();
  const text = caption ?? `${value}/${total} · ${pct}%`;
  return (
    <div className="meter">
      <div className="meter-head">
        <span id={id}>{label}</span>
        <span className="muted num">{text}</span>
      </div>
      <div className="meter-track" role="progressbar" aria-labelledby={id} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-valuetext={text}>
        <i style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
