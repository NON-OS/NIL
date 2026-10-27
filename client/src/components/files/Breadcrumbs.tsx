import { ChevronRight } from 'lucide-react';
import router from '../../lib/router';
import cx from '../../lib/cx';
import type { DragEvent } from 'react';
import type FolderItem from '../../types/FolderItem';
import type SharedFolder from '../../types/SharedFolder';

interface Props {
  folder: SharedFolder;
  path: FolderItem[];
  dropTarget: string | null;
  // drag handlers for a crumb, by the folder it stands for (null for the top of the shared folder)
  drop: (parentId: string | null) => { onDragOver: (e: DragEvent) => void; onDragLeave: (e: DragEvent) => void; onDrop: (e: DragEvent) => void };
}

// Where you are: Files, the shared folder, then each subfolder down to this one. Each crumb is
// a link, and a place to drop a file to move it there.
export default function Breadcrumbs({ folder, path, dropTarget, drop }: Props) {
  const crumbs: { id: string | null; to: string; name: string }[] = [{ id: null, to: `/files/${folder.id}`, name: folder.name }, ...path.map((p) => ({ id: p.id, to: `/files/${p.id}`, name: p.name }))];
  return (
    <nav aria-label="Folder path">
      <ol className="files-crumbs">
        <li>
          <a className="files-crumb" href="/files" onClick={router.link('/files')}>
            Files
          </a>
        </li>
        {crumbs.map((c, i) => (
          <li key={c.id ?? 'top'}>
            <ChevronRight aria-hidden="true" />
            <a className={cx('files-crumb', dropTarget === (c.id ?? folder.id) && 'drop-target')} href={c.to} onClick={router.link(c.to)} aria-current={i === crumbs.length - 1 ? 'page' : undefined} title={c.name} {...drop(c.id)}>
              {c.name}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
