import dates from '../../lib/dates';
import fileSize from '../../lib/fileSize';
import type FolderItem from '../../types/FolderItem';

// The short line under a file's or folder's name.
export default function itemCaption(item: FolderItem, count?: number) {
  if (item.locked) return 'Can’t be confirmed';
  if (item.kind === 'folder') return count ? `${count} ${count === 1 ? 'item' : 'items'}` : 'Empty folder';
  return `${fileSize(item.size)} · ${dates.ago(item.updatedAt)}`;
}
