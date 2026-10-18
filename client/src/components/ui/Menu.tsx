import './Menu.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import fuzzyScore from '../../lib/fuzzyScore';
import type MenuOption from '../../types/MenuOption';

interface Props {
  options: MenuOption[];
  selected?: string | string[] | null;
  onSelect: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
  // what the list is for, for screen readers
  label?: string;
}

export default function Menu({ options, selected, onSelect, placeholder = 'Search…', searchable = true, onCreate, createLabel, label }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const chosen = useMemo(() => new Set(Array.isArray(selected) ? selected : selected ? [selected] : []), [selected]);

  const visible = useMemo(() => {
    if (!query.trim()) return options;
    return options
      .map((o) => ({ o, score: fuzzyScore(`${o.label} ${o.keywords ?? ''}`, query) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.o);
  }, [options, query]);

  const canCreate = !!onCreate && query.trim().length > 0 && !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());
  const total = visible.length + (canCreate ? 1 : 0);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (index: number) => {
    if (index < visible.length) onSelect(visible[index].value);
    else if (canCreate) onCreate!(query.trim());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % Math.max(total, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + total) % Math.max(total, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    }
  };

  return (
    <div className="menu" onKeyDown={onKeyDown}>
      {searchable && <input className="menu-search" autoFocus placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={placeholder} />}
      {/* the list items are only there for layout; to a screen reader the options sit in the listbox */}
      <ul className="menu-list" ref={listRef} role="listbox" aria-label={label} tabIndex={searchable ? -1 : 0} autoFocus={!searchable} hidden={!total}>
        {visible.map((o, i) => (
          <li key={o.value} role="none">
            <button
              type="button"
              className="menu-item"
              data-index={i}
              data-active={i === active}
              role="option"
              aria-selected={chosen.has(o.value)}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {o.icon}
              <span className="menu-label">
                {o.label}
                {o.detail && <small className="menu-detail">{o.detail}</small>}
              </span>
              {o.hint && <span className="menu-hint">{o.hint}</span>}
              {chosen.has(o.value) && <Check className="menu-check" />}
            </button>
          </li>
        ))}
        {canCreate && (
          <li role="none">
            <button type="button" className="menu-item" data-index={visible.length} data-active={active === visible.length} onMouseEnter={() => setActive(visible.length)} onClick={() => choose(visible.length)}>
              <Plus size={14} />
              <span className="menu-label">{createLabel ? createLabel(query.trim()) : `Create “${query.trim()}”`}</span>
            </button>
          </li>
        )}
      </ul>
      {!total && <p className="menu-empty">No matches</p>}
    </div>
  );
}
