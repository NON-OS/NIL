import NameModal from './NameModal';
import MoveModal from './MoveModal';
import DeleteModal from './DeleteModal';
import ShareFolderModal from './ShareFolderModal';
import useStore from '../../state/useStore';
import folders from '../../actions/folders';
import filesLimits from '../../lib/filesLimits';
import folderFiles from '../../actions/folderFiles';
import router from '../../lib/router';
import isAdmin from '../../lib/isAdmin';
import type FileDialog from '../../types/FileDialog';
import type FolderItem from '../../types/FolderItem';
import type SharedFolder from '../../types/SharedFolder';

interface Props {
  dialog: FileDialog | null;
  folder: SharedFolder;
  items: FolderItem[];
  parent: string | null;
  onClose: () => void;
  put: (item: FolderItem) => void;
  drop: (id: string) => void;
  // after something was done to several picked together
  onDoneMany: () => void;
  setFolder: (folder: SharedFolder) => void;
  reload: () => Promise<void>;
}

// The dialog open over a folder, if any: naming, moving, deleting and sharing.
export default function FolderDialogs({ dialog, folder, items, parent, onClose, put, drop, onDoneMany, setFolder, reload }: Props) {
  const me = useStore((s) => s.me)!;
  if (!dialog) return null;
  switch (dialog.kind) {
    case 'new':
      return <NameModal title="New folder" label="Name" submit="Create" onSubmit={async (name) => put(await folderFiles.newFolder(folder, parent, name))} onClose={onClose} />;
    case 'rename':
      return <NameModal title={dialog.item.kind === 'folder' ? 'Rename folder' : 'Rename file'} label="Name" initial={dialog.item.name} submit="Rename" onSubmit={async (name) => put(await folderFiles.rename(folder, dialog.item, name))} onClose={onClose} />;
    case 'move':
      return <MoveModal folder={folder} items={items} moving={[dialog.item]} onMove={async (into) => put(await folderFiles.move(folder, dialog.item, into))} onClose={onClose} />;
    case 'moveMany':
      return (
        <MoveModal
          folder={folder}
          items={items}
          moving={dialog.items}
          onMove={async (into) => {
            (await folderFiles.moveMany(folder, dialog.items, into)).forEach(put);
            onDoneMany();
          }}
          onClose={onClose}
        />
      );
    case 'deleteMany':
      return (
        <DeleteModal
          name={`${dialog.items.length} items`}
          folder={false}
          many
          trashDays={Math.round(filesLimits().trashMs / 86_400_000)}
          onDelete={async () => {
            await folderFiles.removeMany(folder, dialog.items);
            onDoneMany();
            void reload();
            if (parent && dialog.items.some((i) => i.id === parent)) router.navigate(`/files/${folder.id}`);
          }}
          onClose={onClose}
        />
      );
    case 'delete':
      return (
        <DeleteModal
          name={dialog.item.locked ? 'Locked file' : dialog.item.name}
          folder={dialog.item.kind === 'folder'}
          trashDays={Math.round(filesLimits().trashMs / 86_400_000)}
          onDelete={async () => {
            await folderFiles.remove(folder, dialog.item);
            drop(dialog.item.id);
            if (dialog.item.id === parent) router.navigate(`/files/${folder.id}`);
          }}
          onClose={onClose}
        />
      );
    case 'renameFolder':
      return <NameModal title="Rename shared folder" label="Name" initial={folder.name} submit="Rename" onSubmit={async (name) => setFolder(await folders.rename(folder, name))} onClose={onClose} />;
    case 'deleteFolder':
      return (
        <DeleteModal
          name={folder.name}
          folder
          onDelete={async () => {
            await folders.remove(folder);
            router.navigate('/files');
          }}
          onClose={onClose}
        />
      );
    case 'share':
      return <ShareFolderModal folder={folder} canManage={folder.createdBy === me.id || isAdmin(me)} onClose={onClose} onDone={() => void reload()} />;
  }
}
