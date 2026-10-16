import './charts.css';
import { useState, type ReactNode } from 'react';

interface Series {
  key: string;
  label: string;
  color: string;
}

interface Row {
  id: string;
  label: string;
  icon?: ReactNode;
  values: Record<string, number>;
}

interface Props {
  rows: Row[];
  series: Series[];
}

// Horizontal stacks with a 2px surface gap between segments and the legend above.
export default function StackedBars({ rows, series }: Props) {
  const [tip, setTip] = useState<{ row: Row; x: number; y: number } | null>(null);
  const totals = rows.map((r) => series.reduce((sum, s) => sum + (r.values[s.key] ?? 0), 0));
  const max = Math.max(1, ...totals);

  return (
    <div className="chart" onMouseLeave={() => setTip(null)}>
      <div className="legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div className="stacked-row" key={row.id}>
          <span className="who">
            {row.icon}
            <span>{row.label}</span>
          </span>
          <div
            className="stacked-track"
            style={{ width: `${(totals[i] / max) * 100}%` }}
            onMouseMove={(e) => {
              const host = (e.currentTarget.closest('.chart') as HTMLElement).getBoundingClientRect();
              setTip({ row, x: e.clientX - host.left, y: e.clientY - host.top });
            }}
          >
            {series.map((s) => (row.values[s.key] ? <div key={s.key} style={{ flex: row.values[s.key], background: s.color }} /> : null))}
          </div>
          <span className="total num">{totals[i]}</span>
        </div>
      ))}
      {tip && (
        <div className="chart-tip" style={{ left: tip.x, top: tip.y }}>
          <strong>{tip.row.label}</strong>
          {series.map((s) => (
            <span key={s.key} className="row-line num">
              <i style={{ background: s.color }} />
              {s.label}: {tip.row.values[s.key] ?? 0}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
