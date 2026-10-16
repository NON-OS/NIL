import dates from '../../lib/dates';
import cx from '../../lib/cx';

interface Props {
  month: string;
  selected: string;
  counts: Record<string, number>;
  onSelect: (day: string) => void;
}

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// enough to say "busy" at a glance; the day itself lists them all
const MAX_DOTS = 3;

// The month as a picker of days, each marked with a dot per task due.
export default function AgendaMonth({ month, selected, counts, onSelect }: Props) {
  const today = dates.today();
  return (
    <div className="agenda-month">
      <div className="agenda-dow" aria-hidden="true">
        {DOW.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="agenda-days">
        {dates.monthGrid(month).flat().map((day) => {
          const count = counts[day] ?? 0;
          return (
            <button
              key={day}
              type="button"
              className={cx(day.slice(0, 7) !== month.slice(0, 7) && 'out', day === today && 'today')}
              aria-pressed={day === selected}
              aria-current={day === today ? 'date' : undefined}
              aria-label={count ? `${dates.long(day)}, ${count} task${count === 1 ? '' : 's'}` : dates.long(day)}
              onClick={() => onSelect(day)}
            >
              <span>{Number(day.slice(8))}</span>
              <span className="agenda-dots" aria-hidden="true">
                {Array.from({ length: Math.min(count, MAX_DOTS) }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
