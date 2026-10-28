import './Files.css';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';
import { FolderOpen, SearchX, UploadCloud } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import Spinner from '../ui/Spinner';
import KeyNotice from '../keys/KeyNotice';
import Breadcrumbs from './Breadcrumbs';
import FolderToolbar from './FolderToolbar';
import FolderNotices from './FolderNotices';
import ItemsView from './ItemsView';
import FolderDialogs from './FolderDialogs';
import SelectionBar from './SelectionBar';
import useStore from '../../state/useStore';
import useFolderListing from '../../hooks/useFolderListing';
import useFileDrop from '../../hooks/useFileDrop';
import useFilesPrefs from '../../hooks/useFilesPrefs';
import useFolderReseal from '../../hooks/useFolderReseal';
import useItemSelection from '../../hooks/useItemSelection';
import TrashModal from './TrashModal';
import toast from '../../state/toast';
import folderFiles from '../../actions/folderFiles';
import fileDownload from '../../actions/fileDownload';
import zipDownload from '../../actions/zipDownload';
import zipPaths from '../../lib/zipPaths';
import uploadQueue from '../../actions/uploadQueue';
import uploadTree from '../../actions/uploadTree';
import droppedFiles, { type Dropped } from '../../lib/droppedFiles';
import filesLimits from '../../lib/filesLimits';
import router from '../../lib/router';
import sortItems from '../../lib/sortItems';
import fileDrag from '../../lib/fileDrag';
import isAdmin from '../../lib/isAdmin';
import type FolderItem from '../../types/FolderItem';
import type FilesOverview from '../../types/FilesOverview';
import type ItemAction from '../../types/ItemAction';
import type FileDialog from '../../types/FileDialog';

const PreviewModal = lazy(() => import('./preview/PreviewModal'));
// a download that takes a moment to decrypt says so
const BIG = 8 * 1024 * 1024;

// Inside a shared folder: its files and subfolders, decrypted and checked in this tab, with
// uploads by button, drop or paste, moves by drag or menu, and previews.
export default function FolderBrowser({ folderId, usage }: { folderId: string; usage: FilesOverview['usage'] | null }) {
  const me = useStore((s) => s.me)!;
  const { listing, error, parent, reload, put, drop, setFolder, missing } = useFolderListing(folderId);
  const [prefs, setPrefs] = useFilesPrefs();
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<FileDialog | null>(null);
  const [preview, setPreview] = useState<FolderItem | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const folder = listing?.folder;
  const items = listing?.items ?? [];
  const trash = listing?.trash ?? [];
  // a folder whose name didn't check out, or that's older than one seen here, takes nothing new
  const canWrite = Boolean(folder) && folder!.warning === null;
  const canManage = Boolean(folder) && (folder!.createdBy === me.id || isAdmin(me));
  const reseal = useFolderReseal(folder, items, trash);
  const [trashOpen, setTrashOpen] = useState(false);
  // another folder starts with a clean search and nothing open over it
  useEffect(() => {
    setQuery('');
    setPreview(null);
    setDialog(null);
  }, [folderId]);

  const path = useMemo(() => {
    const out: FolderItem[] = [];
    for (let at = items.find((i) => i.id === parent); at; at = items.find((i) => i.id === at!.parentId)) out.unshift(at);
    return out;
  }, [items, parent]);

  // files go straight into the queue; folders are made first, with the files going into them
  const upload = useCallback(
    (dropped: Dropped[], into: string | null = parent) => {
      if (!folder || !canWrite) return;
      const maxFile = usage?.maxFile ?? 0;
      if (dropped.every((d) => !d.path.length)) return uploadQueue.add(folder, into, dropped.map((d) => d.file!), { maxFile, onDone: put });
      let depth = 0;
      for (let at = items.find((i) => i.id === into); at; at = items.find((i) => i.id === at!.parentId)) depth++;
      uploadTree(folder, dropped, { parentId: into, depth, held: items.length + trash.length, maxFile, put }).catch(toast.error);
    },
    [folder, canWrite, parent, usage, put, items, trash.length],
  );
  const { dragging, zone } = useFileDrop(upload, canWrite);
  const counts = useMemo(() => {
    const n = new Map<string, number>();
    for (const i of items) if (i.parentId) n.set(i.parentId, (n.get(i.parentId) ?? 0) + 1);
    return n;
  }, [items]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const here = q ? items.filter((i) => !i.locked && i.name.toLowerCase().includes(q)) : items.filter((i) => i.parentId === parent);
    return sortItems(here, prefs.sort);
  }, [items, parent, query, prefs.sort]);
  const files = shown.filter((i) => i.kind === 'file' && !i.locked);
  const { picked, isPicked, select, all, toggleAll, clear } = useItemSelection(shown, [folderId, parent, query]);
  const mayChange = (i: FolderItem) => i.createdBy === me.id || canManage;

  // several files, or a folder with everything in it, as one zip, with its progress in the tray
  const zip = (chosen: FolderItem[]) => {
    if (!folder) return;
    const name = `${chosen.length === 1 ? chosen[0].name : (path.at(-1)?.name ?? folder.name)}.zip`;
    uploadQueue.track(name, zipPaths(chosen, items).bytes, folder.id, async (opts) => {
      const locked = await zipDownload.save(folder, chosen, items, name, opts);
      if (locked) toast.show(`${locked} locked ${locked === 1 ? 'item was' : 'items were'} left out of the zip, since this browser can’t open ${locked === 1 ? 'it' : 'them'}.`);
      return locked;
    });
  };

  const download = (item: FolderItem) => {
    if (!folder) return;
    if (item.kind === 'folder') return zip([item]);
    if (item.size > BIG) toast.show(`Decrypting ${item.name} for download…`);
    fileDownload.save(folder, item).catch(toast.error);
  };

  const act = (item: FolderItem, action: ItemAction) => {
    if (action === 'open') {
      if (item.locked) return;
      if (item.kind === 'folder') {
        setQuery('');
        router.navigate(`/files/${item.id}`);
      } else setPreview(item);
    } else if (action === 'download') download(item);
    else setDialog({ kind: action, item });
  };

  const move = async (moving: FolderItem[], into: string | null) => {
    const going = moving.filter((i) => i.parentId !== into && i.id !== into);
    if (!folder || !going.length) return;
    try {
      if (going.length === 1) put(await folderFiles.move(folder, going[0], into));
      else (await folderFiles.moveMany(folder, going, into)).forEach(put);
      clear();
    } catch (err) {
      toast.error(err);
    }
  };

  // dropping onto a folder: a file moved inside Nil goes in, files from the computer go up into it
  const dropOn = (into: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!canWrite || (!fileDrag.isItem(e) && !fileDrag.fromComputer(e)) || dragged === into) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = fileDrag.isItem(e) ? 'move' : 'copy';
      setTarget(into ?? folder?.id ?? null);
    },
    onDragLeave: () => setTarget(null),
    onDrop: (e: DragEvent) => {
      setTarget(null);
      if (!canWrite) return;
      e.preventDefault();
      e.stopPropagation();
      const ids = e.dataTransfer.getData(fileDrag.ITEM).split(',').filter(Boolean);
      const moving = items.filter((i) => ids.includes(i.id));
      if (moving.length) void move(moving, into);
      else if (fileDrag.fromComputer(e)) droppedFiles(e.dataTransfer, filesLimits().folderItemsMax).then((d) => upload(d, into), toast.error);
    },
  });

  const onKey = (item: FolderItem, e: KeyboardEvent) => {
    const deleting = e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey);
    if (e.key === ' ') select(item, e.shiftKey);
    else if (e.key.toLowerCase() === 'a' && (e.metaKey || e.ctrlKey)) all();
    else if (e.key === 'Escape' && picked.length) clear();
    else if (deleting && picked.length > 1) {
      if (picked.every(mayChange)) setDialog({ kind: 'deleteMany', items: picked });
    } else if (e.key === 'F2' && canWrite && !item.locked) setDialog({ kind: 'rename', item });
    else if (deleting && mayChange(item)) setDialog({ kind: 'delete', item });
    else if (e.key === 'Backspace' && !e.metaKey && listing) router.navigate(path.length ? `/files/${path.length > 1 ? path[path.length - 2].id : listing.folder.id}` : '/files');
    else return false;
    return true;
  };

  if (error && !listing) {
    return (
      <div className="files-page">
        <EmptyState icon={<FolderOpen />} title="This folder couldn’t be opened" actions={<button type="button" className="btn" onClick={() => void reload()}>Try again</button>}>
          {error}
        </EmptyState>
      </div>
    );
  }
  if (!folder) {
    return (
      <div className="files-state" role="status">
        <Spinner size={20} />
        <span>Opening and checking the folder…</span>
      </div>
    );
  }

  return (
    <div className="files-page" {...zone}>
      <KeyNotice reason="shared folders" />
      <Breadcrumbs folder={folder} path={path} dropTarget={target} drop={dropOn} />
      <FolderNotices folder={folder} missing={missing} waiting={reseal.waiting} problem={reseal.problem} />
      {picked.length ? (
        <SelectionBar
          picked={picked}
          canMove={canWrite && picked.every(mayChange)}
          canDelete={picked.every(mayChange)}
          onDownload={() => zip(picked)}
          onMove={() => setDialog({ kind: 'moveMany', items: picked.filter((i) => !i.locked) })}
          onDelete={() => setDialog({ kind: 'deleteMany', items: picked })}
          onClear={clear}
        />
      ) : (
        <FolderToolbar
          folder={folder}
          query={query}
          onQuery={setQuery}
          mode={prefs.mode}
          onMode={(mode) => setPrefs({ mode })}
          sort={prefs.sort}
          onSort={(sort) => setPrefs({ sort })}
          canWrite={canWrite}
          canManage={canManage}
          onUpload={(d) => upload(d)}
          onNewFolder={() => setDialog({ kind: 'new' })}
          onShare={() => setDialog({ kind: 'share' })}
          onRename={() => setDialog({ kind: 'renameFolder' })}
          onDelete={() => setDialog({ kind: 'deleteFolder' })}
          trashCount={trash.filter((i) => i.trashRoot === i.id).length}
          onTrash={() => setTrashOpen(true)}
        />
      )}
      {shown.length ? (
        <ItemsView
          folder={folder}
          items={shown}
          counts={counts}
          mode={prefs.mode}
          sort={prefs.sort}
          onSort={(sort) => setPrefs({ sort })}
          onKey={onKey}
          label={query ? 'Search results' : `Contents of ${path.at(-1)?.name ?? folder.name}`}
          onSelectAll={toggleAll}
          handlers={{
            canWrite,
            canDelete: mayChange,
            selecting: picked.length > 0,
            selected: isPicked,
            onSelect: select,
            dropTarget: target,
            onAction: act,
            // while anything is picked, or with Shift, Ctrl or ⌘ held, a click picks instead of opening
            onClick: (i, e) => (picked.length || e.shiftKey || e.metaKey || e.ctrlKey ? select(i, e.shiftKey) : act(i, 'open')),
            drag: (i) => ({
              draggable: canWrite && !i.locked,
              onDragStart: (e: DragEvent) => {
                // dragging one of several picked moves all of them
                const moving = isPicked(i) ? picked.filter((p) => !p.locked) : [i];
                e.dataTransfer.setData(fileDrag.ITEM, moving.map((m) => m.id).join(','));
                e.dataTransfer.effectAllowed = 'move';
                setDragged(i.id);
              },
              onDragEnd: () => setDragged(null),
              ...(i.kind === 'folder' && !i.locked ? dropOn(i.id) : {}),
            }),
          }}
        />
      ) : query ? (
        <EmptyState icon={<SearchX />} title="Nothing here by that name">
          Search looks through the names this browser decrypted, in this folder and every folder inside it.
        </EmptyState>
      ) : (
        <EmptyState icon={<UploadCloud />} title="This folder is empty">
          {canWrite ? 'Drop files here, paste them, or choose Upload. They’re encrypted in your browser before they leave it.' : 'Nothing has been added yet.'}
        </EmptyState>
      )}
      {dragging && (
        <div className="files-drop" aria-hidden="true">
          <UploadCloud />
          Drop to encrypt and upload to {path.at(-1)?.name ?? folder.name}
        </div>
      )}
      <FolderDialogs dialog={dialog} folder={folder} items={items} parent={parent} onClose={() => setDialog(null)} put={put} drop={drop} onDoneMany={clear} setFolder={setFolder} reload={reload} />
      {trashOpen && <TrashModal folder={folder} trash={trash} canManage={canManage} onChanged={() => void reload()} onClose={() => setTrashOpen(false)} />}
      {preview && (
        <Suspense fallback={null}>
          <PreviewModal folder={folder} item={preview} files={files} onShow={setPreview} onDownload={download} onClose={() => setPreview(null)} />
        </Suspense>
      )}
    </div>
  );
}
