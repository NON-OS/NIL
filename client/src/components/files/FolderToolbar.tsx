import '../ui/Menu.css';
import { useRef, useState } from 'react';
import { Archive, FolderPlus, FolderUp, LayoutGrid, List, Lock, MoreHorizontal, Pencil, Trash2, Upload, Users } from 'lucide-react';
import Popover from '../ui/Popover';
import type SharedFolder from '../../types/SharedFolder';
import type ItemSort from '../../types/ItemSort';
import type { Dropped } from '../../lib/droppedFiles';

const SORTS: { value: string; label: string; sort: ItemSort }[] = [
  { value: 'name', label: 'Name, A to Z', sort: { by: 'name', desc: false } },
  { value: 'name-desc', label: 'Name, Z to A', sort: { by: 'name', desc: true } },
  { value: 'updated-desc', label: 'Newest first', sort: { by: 'updated', desc: true } },
  { value: 'updated', label: 'Oldest first', sort: { by: 'updated', desc: false } },
  { value: 'size-desc', label: 'Largest first', sort: { by: 'size', desc: true } },
  { value: 'size', label: 'Smallest first', sort: { by: 'size', desc: false } },
  { value: 'type', label: 'Type', sort: { by: 'type', desc: false } },
];
const valueOf = (sort: ItemSort) => SORTS.find((s) => s.sort.by === sort.by && s.sort.desc === sort.desc)?.value ?? 'name';

interface Props {
  folder: SharedFolder;
  query: string;
  onQuery: (query: string) => void;
  mode: 'grid' | 'list';
  onMode: (mode: 'grid' | 'list') => void;
  sort: ItemSort;
  onSort: (sort: ItemSort) => void;
  canWrite: boolean;
  canManage: boolean;
  onUpload: (dropped: Dropped[]) => void;
  onNewFolder: () => void;
  onShare: () => void;
  onRename: () => void;
  onDelete: () => void;
  // how many deleted things wait in the trash
  trashCount: number;
  onTrash: () => void;
}

// Upload, new folder, who can open it, search over the decrypted names, the order, and grid or
// list.
export default function FolderToolbar({ folder, query, onQuery, mode, onMode, sort, onSort, canWrite, canManage, onUpload, onNewFolder, onShare, onRename, onDelete, trashCount, onTrash }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const tree = useRef<HTMLInputElement | null>(null);
  const more = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const audience = folder.audience === 'team' ? 'Team' : `${folder.readers.length} ${folder.readers.length === 1 ? 'person' : 'people'}`;
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="files-bar">
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onUpload(files.map((file) => ({ file, path: [] })));
        }}
      />
      <input
        ref={(el) => {
          tree.current = el;
          // a picker for a whole folder, which React has no attribute for
          el?.setAttribute('webkitdirectory', '');
        }}
        type="file"
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) onUpload(files.map((file) => ({ file, path: file.webkitRelativePath.split('/').slice(0, -1) })));
        }}
      />
      <button type="button" className="btn btn-primary" onClick={() => input.current?.click()} disabled={!canWrite}>
        <Upload /> Upload
      </button>
      <button type="button" className="btn tip" onClick={() => tree.current?.click()} disabled={!canWrite} aria-label="Upload a folder">
        <FolderUp />
      </button>
      <button type="button" className="btn" onClick={onNewFolder} disabled={!canWrite}>
        <FolderPlus /> New folder
      </button>
      <button type="button" className="btn" onClick={onShare} aria-label={`Who can open this, ${audience}`}>
        {folder.audience === 'team' ? <Users /> : <Lock />} {audience}
      </button>
      <input className="input files-search" type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search this folder" aria-label="Search this folder" />
      <div className="files-bar-end">
        <select className="select files-sort-select" value={valueOf(sort)} onChange={(e) => onSort(SORTS.find((s) => s.value === e.target.value)!.sort)} aria-label="Sort by">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="button" className="icon-btn tip" onClick={() => onMode('grid')} aria-pressed={mode === 'grid'} aria-label="Show as a grid">
          <LayoutGrid />
        </button>
        <button type="button" className="icon-btn tip" onClick={() => onMode('list')} aria-pressed={mode === 'list'} aria-label="Show as a list">
          <List />
        </button>
        <button ref={more} type="button" className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="More folder actions" aria-expanded={open}>
          <MoreHorizontal />
        </button>
        <Popover anchor={more} open={open} onClose={() => setOpen(false)} width={220} align="end">
          <div className="menu-list">
            <button type="button" className="menu-item" onClick={run(onTrash)}>
              <Archive size={15} /> Trash{trashCount ? ` (${trashCount})` : ''}
            </button>
            <button type="button" className="menu-item" onClick={run(onRename)} disabled={!canManage}>
              <Pencil size={15} /> Rename shared folder
            </button>
            {canManage && (
              <>
                <div className="menu-divider" />
                <button type="button" className="menu-item danger" onClick={run(onDelete)}>
                  <Trash2 size={15} /> Delete shared folder
                </button>
              </>
            )}
          </div>
        </Popover>
      </div>
    </div>
  );
}
