import './charts.css';
import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: number | string;
  sub?: ReactNode;
}

export default function StatTile({ label, value, sub }: Props) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
