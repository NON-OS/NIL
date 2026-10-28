import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import ItemTile from './ItemTile';
import ItemRow from './ItemRow';
import useStore from '../../state/useStore';
import cx from '../../lib/cx';
import type FolderItem from '../../types/FolderItem';
import type ItemHandlers from '../../types/ItemHandlers';
import type ItemSort from '../../types/ItemSort';
import type SharedFolder from '../../types/SharedFolder';

interface Props {
  folder: SharedFolder;
  items: FolderItem[];
  counts: Map<string, number>;
  mode: 'grid' | 'list';
  sort: ItemSort;
  onSort: (sort: ItemSort) => void;
  handlers: Omit<ItemHandlers, 'tabbable' | 'onFocus'>;
  // keys beyond moving around (F2, Delete and the like); true when handled
  onKey: (item: FolderItem, e: KeyboardEvent) => boolean;
  label: string;
  // picks everything shown, or nothing when all of it is picked already
  onSelectAll: () => void;
}

const COLUMNS: { by: ItemSort['by']; label: string }[] = [
  { by: 'size', label: 'Size' },
  { by: 'updated', label: 'Changed' },
];

// A folder's contents as a grid or a list. One item at a time takes Tab; the arrow keys, Home
// and End move between them, the way a file manager's do.
export default function ItemsView({ folder, items, counts, mode, sort, onSort, handlers, onKey, label, onSelectAll }: Props) {
  const users = useStore((s) => s.users);
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const current = items.some((i) => i.id === active) ? active : (items[0]?.id ?? null);
  const local: ItemHandlers = { ...handlers, tabbable: (i) => i.id === current, onFocus: (i) => setActive(i.id) };
  const picked = items.filter(handlers.selected).length;

  useEffect(() => {
    if (active && !items.some((i) => i.id === active)) setActive(null);
  }, [items, active]);

  const focus = (index: number) => {
    const target = items[Math.max(0, Math.min(items.length - 1, index))];
    if (!target) return;
    setActive(target.id);
    ref.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(target.id)}"]`)?.focus();
  };

  // how many tiles sit in a row of the grid as it's laid out now
  const columns = () => {
    const tiles = [...(ref.current?.querySelectorAll<HTMLElement>('.files-tile') ?? [])];
    return Math.max(1, tiles.filter((t) => t.offsetTop === tiles[0]?.offsetTop).length);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const at = items.findIndex((i) => i.id === current);
    if (at < 0 || !(e.target as HTMLElement).matches('[data-item]')) return;
    const step = mode === 'grid' ? columns() : 1;
    const moves: Record<string, number> = { ArrowDown: at + step, ArrowUp: at - step, Home: 0, End: items.length - 1, ...(mode === 'grid' ? { ArrowRight: at + 1, ArrowLeft: at - 1 } : {}) };
    if (e.key in moves && !e.altKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      focus(moves[e.key]);
    } else if (onKey(items[at], e)) e.preventDefault();
  };

  const header = (by: ItemSort['by'], text: string, wide = true) => (
    <th scope="col" className={wide ? 'files-cell-meta wide' : undefined} aria-sort={sort.by === by ? (sort.desc ? 'descending' : 'ascending') : undefined}>
      <button type="button" className="files-sort" onClick={() => onSort({ by, desc: sort.by === by ? !sort.desc : by !== 'name' })}>
        {text} {sort.by === by && (sort.desc ? <ArrowDown aria-hidden="true" /> : <ArrowUp aria-hidden="true" />)}
      </button>
    </th>
  );

  return (
    <div ref={ref} onKeyDown={onKeyDown}>
      {mode === 'grid' ? (
        <ul className={cx('files-grid', handlers.selecting && 'selecting')} aria-label={label}>
          {items.map((item) => (
            <ItemTile key={item.id} folder={folder} item={item} count={counts.get(item.id)} handlers={local} />
          ))}
        </ul>
      ) : (
        <table className={cx('files-list', handlers.selecting && 'selecting')} aria-label={label}>
          <thead>
            <tr>
              <th scope="col" className="files-cell-check">
                <input
                  type="checkbox"
                  className="files-check"
                  checked={picked > 0 && picked === items.length}
                  ref={(el) => {
                    if (el) el.indeterminate = picked > 0 && picked < items.length;
                  }}
                  onChange={onSelectAll}
                  aria-label={picked === items.length ? 'Select none' : 'Select all'}
                />
              </th>
              {header('name', 'Name', false)}
              {COLUMNS.map((c) => header(c.by, c.label))}
              <th scope="col" className="files-cell-meta wide">
                Signed by
              </th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <ItemRow key={item.id} folder={folder} item={item} count={counts.get(item.id)} signer={item.by ? (users[item.by]?.name ?? 'A former member') : ''} handlers={local} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
