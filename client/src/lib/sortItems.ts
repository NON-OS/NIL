import type FolderItem from '../types/FolderItem';
import type ItemSort from '../types/ItemSort';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const extension = (name: string) => /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';

// Folders first, then files, each in the order picked; ties fall back to the name, so the order
// never jumps between two loads. Locked items go last: there's nothing to sort them by.
export default function sortItems(items: FolderItem[], { by, desc }: ItemSort) {
  const compare = (a: FolderItem, b: FolderItem) => {
    if (by === 'updated') return a.updatedAt - b.updatedAt;
    if (by === 'size') return a.size - b.size;
    if (by === 'type') return collator.compare(extension(a.name) || a.type, extension(b.name) || b.type);
    return 0;
  };
  return [...items].sort((a, b) => {
    if (a.locked !== b.locked) return a.locked ? 1 : -1;
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    const order = compare(a, b) || collator.compare(a.name, b.name);
    return desc ? -order : order;
  });
}
