import './DatePicker.css';
import { useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Popover from './Popover';
import dates from '../../lib/dates';
import cx from '../../lib/cx';

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  children: ReactNode;
  title: string;
  className?: string;
}

function quickPicks(today: string) {
  const friday = dates.addDays(today, (5 - dates.parse(today).getDay() + 7) % 7);
  const nextMonday = dates.addDays(dates.weekStart(today), 7);
  return [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: dates.addDays(today, 1) },
    { label: 'This Friday', value: friday },
    { label: 'Next Monday', value: nextMonday },
    { label: 'In 2 weeks', value: dates.addDays(today, 14) },
    { label: 'Next month', value: dates.addMonths(today, 1) },
  ];
}

export default function DatePicker({ value, onChange, children, title, className = 'prop-btn' }: Props) {
  const today = dates.today();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value ?? today);
  const anchor = useRef<HTMLButtonElement>(null);

  const pick = (v: string | null) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={anchor}
        type="button"
        className={className}
        title={title}
        aria-label={title}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setMonth(value ?? today);
          setOpen((o) => !o);
        }}
      >
        {children}
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={272}>
        <div className="datepicker">
          <div className="datepicker-quick">
            {quickPicks(today).map((q) => (
              <button key={q.label} type="button" onClick={() => pick(q.value)}>
                {q.label}
                <span>{dates.relative(q.value).slice(0, 6)}</span>
              </button>
            ))}
          </div>
          <div className="datepicker-head">
            <button type="button" className="icon-btn" onClick={() => setMonth(dates.addMonths(month, -1))} aria-label="Previous month">
              <ChevronLeft />
            </button>
            <span>
              {dates.MONTHS_LONG[dates.parse(month).getMonth()]} {month.slice(0, 4)}
            </span>
            <button type="button" className="icon-btn" onClick={() => setMonth(dates.addMonths(month, 1))} aria-label="Next month">
              <ChevronRight />
            </button>
          </div>
          <div className="datepicker-grid">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <span key={i} className="dow">
                {d}
              </span>
            ))}
            {dates.monthGrid(month).flat().map((d) => (
              <button
                key={d}
                type="button"
                className={cx(d.slice(0, 7) !== month.slice(0, 7) && 'out', d === today && 'today', d === value && 'selected')}
                onClick={() => pick(d)}
                aria-label={dates.long(d)}
              >
                {Number(d.slice(8))}
              </button>
            ))}
          </div>
          {value && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: '100%' }} onClick={() => pick(null)}>
              Clear date
            </button>
          )}
        </div>
      </Popover>
    </>
  );
}
