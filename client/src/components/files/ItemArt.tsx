import { useRef } from 'react';
import FileIcon from './FileIcon';
import useThumbnail from '../../hooks/useThumbnail';
import cx from '../../lib/cx';
import type FolderItem from '../../types/FolderItem';
import type SharedFolder from '../../types/SharedFolder';

// A file's thumbnail once it has scrolled into view and been decrypted, its icon until then.
export default function ItemArt({ folder, item }: { folder: SharedFolder; item: FolderItem }) {
  const ref = useRef<HTMLDivElement>(null);
  const thumb = useThumbnail(folder, item, ref);
  return (
    <div ref={ref} className={cx('files-art', item.locked && 'locked')}>
      {thumb ? <img src={thumb} alt="" draggable={false} /> : <FileIcon kind={item.kind} type={item.type} name={item.name} locked={item.locked} />}
    </div>
  );
}
