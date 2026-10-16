import { useEffect, useRef } from 'react';
import StatusIcon from '../ui/StatusIcon';
import meta from '../../lib/meta';
import type Status from '../../types/Status';

interface Props {
  statuses: Status[];
  counts: Record<Status, number>;
  active: number;
  onPick: (index: number) => void;
}

// On a phone the board shows one column at a time; these jump between them. Columns still
// swipe, and the strip follows whichever one is in view.
export default function BoardTabs({ statuses, counts, active, onPick }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const strip = ref.current;
    const tab = strip?.children[active] as HTMLElement | undefined;
    if (!strip || !tab || !strip.offsetWidth) return;
    strip.scrollTo({ left: tab.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2 });
  }, [active]);

  return (
    <nav ref={ref} className="board-tabs" aria-label="Board columns">
      {statuses.map((status, i) => (
        <button key={status} type="button" aria-current={i === active ? 'true' : undefined} onClick={() => onPick(i)}>
          <StatusIcon status={status} />
          {meta.status[status]}
          <span className="num">{counts[status]}</span>
        </button>
      ))}
    </nav>
  );
}
