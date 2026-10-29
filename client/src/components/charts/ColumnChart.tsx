import './charts.css';
import { useEffect, useRef, useState } from 'react';

interface Datum {
  label: string;
  value: number;
  detail: string;
}

interface Props {
  data: Datum[];
  height?: number;
  color?: string;
  unit: string;
}

const PAD = { top: 18, right: 8, bottom: 24, left: 28 };
// room one axis label like "Sep 28" needs at 11px, so narrow charts label every few columns
const LABEL_W = 46;

function niceMax(v: number) {
  if (v <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
}

// Single-series columns: one baseline, capped width, rounded tops, labels only on the last and the peak.
export default function ColumnChart({ data, height = 200, color = 'var(--accent-line)', unit }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);

  // draw in real pixels so labels stay 11px at any width
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const band = plotW / data.length;
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const every = Math.max(1, Math.ceil(LABEL_W / band));
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);

  return (
    <div className="chart" ref={host}>
      <svg viewBox={`0 0 ${W} ${height}`} height={height} role="img" aria-label={`${unit} per week`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'axis' : 'grid'} x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = PAD.left + band * i + band / 2;
          const h = Math.max(0, y(0) - y(d.value));
          const r = Math.min(4, h, barW / 2);
          const x = cx - barW / 2;
          const top = y(d.value);
          const path = h > 0 ? `M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${y(0)} Z` : '';
          const labelled = d.value > 0 && (i === data.length - 1 || i === peak);
          return (
            <g key={d.label}>
              {path && <path d={path} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />}
              {labelled && (
                <text className="value-label" x={cx} y={top - 6} textAnchor="middle">
                  {d.value}
                </text>
              )}
              {(data.length - 1 - i) % every === 0 && (
                <text x={cx} y={height - 6} textAnchor="middle">
                  {d.label}
                </text>
              )}
              <rect className="hit" x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((PAD.left + band * hover + band / 2) / W) * 100}%`, top: `${(y(data[hover].value) / height) * 100}%` }}>
          <strong>{data[hover].detail}</strong>
          <span className="num">
            {data[hover].value} {unit}
          </span>
        </div>
      )}
    </div>
  );
}
