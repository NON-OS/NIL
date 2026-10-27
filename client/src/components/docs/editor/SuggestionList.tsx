import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export interface SuggestionItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

export interface SuggestionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface Props {
  items: SuggestionItem[];
  command: (item: SuggestionItem) => void;
  label: string;
  empty: string;
}

// The pop-up list behind / for blocks and @ for people: arrow keys move, Enter or Tab picks.
const SuggestionList = forwardRef<SuggestionListHandle, Props>(function SuggestionList({ items, command, label, empty }, ref) {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => setActive(0), [items]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (!items.length) return false;
      if (event.key === 'ArrowDown') setActive((a) => (a + 1) % items.length);
      else if (event.key === 'ArrowUp') setActive((a) => (a - 1 + items.length) % items.length);
      else if (event.key === 'Enter' || event.key === 'Tab') command(items[active]);
      else return false;
      return true;
    },
  }));

  return (
    <div className="doc-suggest" role="listbox" aria-label={label} ref={listRef}>
      {items.length ? (
        items.map((item, i) => (
          <button key={item.id} type="button" role="option" aria-selected={i === active} data-index={i} className="doc-suggest-item" onMouseEnter={() => setActive(i)} onMouseDown={(e) => (e.preventDefault(), command(item))}>
            {item.icon && <span className="doc-suggest-icon">{item.icon}</span>}
            <span>{item.label}</span>
            {item.hint && <kbd>{item.hint}</kbd>}
          </button>
        ))
      ) : (
        <p className="doc-suggest-empty">{empty}</p>
      )}
    </div>
  );
});

export default SuggestionList;
