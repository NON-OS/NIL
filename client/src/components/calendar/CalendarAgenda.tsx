import './Agenda.css';
import { useMemo, useRef, useState } from 'react';
import MonthNav from './MonthNav';
import AgendaMonth from './AgendaMonth';
import AgendaDay from './AgendaDay';
import AgendaTask from './AgendaTask';
import dates from '../../lib/dates';
import type Task from '../../types/Task';

interface Props {
  month: string;
  onMonth: (month: string) => void;
  byDay: Record<string, Task[]>;
  unscheduled: Task[];
}

// The calendar on a phone: pick a day to see and add its tasks, with the rest of the month
// listed below. A seven-column grid leaves two letters per task at this width.
export default function CalendarAgenda({ month, onMonth, byDay, unscheduled }: Props) {
  const today = dates.today();
  const sameMonth = (a: string, b: string) => a.slice(0, 7) === b.slice(0, 7);
  const firstPick = (m: string) => (sameMonth(m, today) ? today : dates.monthStart(m));
  const [picked, setPicked] = useState(() => firstPick(month));
  const panel = useRef<HTMLDivElement>(null);

  const counts = useMemo(() => Object.fromEntries(Object.entries(byDay).map(([day, list]) => [day, list.length])), [byDay]);
  const rest = useMemo(() => Object.keys(byDay).filter((d) => sameMonth(d, month) && d !== picked).sort(), [byDay, month, picked]);

  const goTo = (m: string) => {
    onMonth(m);
    setPicked(firstPick(m));
  };
  const pick = (day: string) => {
    if (!sameMonth(day, month)) onMonth(day);
    setPicked(day);
  };
  const pickFromList = (day: string) => {
    setPicked(day);
    panel.current?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="agenda">
      <MonthNav month={month} onChange={goTo} />
      <AgendaMonth month={month} selected={picked} counts={counts} onSelect={pick} />
      <div ref={panel} className="agenda-panel">
        <AgendaDay day={picked} tasks={byDay[picked] ?? []} />
      </div>
      {rest.length > 0 && (
        <section className="agenda-list" aria-labelledby="agenda-rest">
          <h2 id="agenda-rest">Also this month</h2>
          {rest.map((day) => (
            <AgendaDay key={day} day={day} tasks={byDay[day]} onPick={() => pickFromList(day)} />
          ))}
        </section>
      )}
      {unscheduled.length > 0 && (
        <section className="agenda-list" aria-labelledby="agenda-undated">
          <h2 id="agenda-undated">No due date</h2>
          <ul className="agenda-tasks">
            {unscheduled.map((t) => (
              <AgendaTask key={t.id} task={t} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
