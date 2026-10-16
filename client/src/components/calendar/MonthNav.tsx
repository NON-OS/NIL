import { ChevronLeft, ChevronRight } from 'lucide-react';
import dates from '../../lib/dates';

interface Props {
  month: string;
  onChange: (month: string) => void;
}

export default function MonthNav({ month, onChange }: Props) {
  return (
    <div className="cal-nav">
      <button type="button" className="icon-btn" onClick={() => onChange(dates.addMonths(month, -1))} aria-label="Previous month">
        <ChevronLeft />
      </button>
      <h2 aria-live="polite">
        {dates.MONTHS_LONG[dates.parse(month).getMonth()]} {month.slice(0, 4)}
      </h2>
      <button type="button" className="icon-btn" onClick={() => onChange(dates.addMonths(month, 1))} aria-label="Next month">
        <ChevronRight />
      </button>
      <button type="button" className="btn" onClick={() => onChange(dates.today())}>
        Today
      </button>
    </div>
  );
}
