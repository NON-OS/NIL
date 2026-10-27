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
import useStore from '../../state/useStore';
import useFolderListing from '../../hooks/useFolderListing';
import useFileDrop from '../../hooks/useFileDrop';
import useFilesPrefs from '../../hooks/useFilesPrefs';
import toast from '../../state/toast';
import folderFiles from '../../actions/folderFiles';
import fileDownload from '../../actions/fileDownload';
import uploadQueue from '../../actions/uploadQueue';
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
  const canWrite = Boolean(folder) && folder!.warning !== 'unverified';
  const canManage = Boolean(folder) && (folder!.createdBy === me.id || isAdmin(me));

  // another folder starts with a clean search and nothing open over it
  useEffect(() => {
    setQuery('');
    setPreview(null);
    setDialog(null);
  }, [folderId]);

  const upload = useCallback(
    (files: File[], into: string | null = parent) => {
      if (!folder || !canWrite) return;
      uploadQueue.add(folder, into, files, { maxFile: usage?.maxFile ?? 0, onDone: put });
    },
    [folder, canWrite, parent, usage, put],
  );
  const { dragging, zone } = useFileDrop(upload, canWrite);

  const path = useMemo(() => {
    const out: FolderItem[] = [];
    for (let at = items.find((i) => i.id === parent); at; at = items.find((i) => i.id === at!.parentId)) out.unshift(at);
    return out;
  }, [items, parent]);
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

  const download = (item: FolderItem) => {
    if (!folder) return;
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

  const move = async (item: FolderItem, into: string | null) => {
    if (!folder || item.parentId === into || item.id === into) return;
    try {
      put(await folderFiles.move(folder, item, into));
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
      const id = e.dataTransfer.getData(fileDrag.ITEM);
      const item = id ? items.find((i) => i.id === id) : null;
      if (item) void move(item, into);
      else if (fileDrag.fromComputer(e)) upload(fileDrag.files(e), into);
    },
  });

  const onKey = (item: FolderItem, e: KeyboardEvent) => {
    if (e.key === 'F2' && canWrite && !item.locked) setDialog({ kind: 'rename', item });
    else if ((e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey)) && (item.createdBy === me.id || isAdmin(me))) setDialog({ kind: 'delete', item });
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
      <FolderNotices folder={folder} missing={missing} />
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
        onUpload={(f) => upload(f)}
        onNewFolder={() => setDialog({ kind: 'new' })}
        onShare={() => setDialog({ kind: 'share' })}
        onRename={() => setDialog({ kind: 'renameFolder' })}
        onDelete={() => setDialog({ kind: 'deleteFolder' })}
      />
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
          handlers={{
            canWrite,
            canDelete: (i) => i.createdBy === me.id || isAdmin(me),
            dropTarget: target,
            onAction: act,
            onClick: (i) => act(i, 'open'),
            drag: (i) => ({
              draggable: canWrite && !i.locked,
              onDragStart: (e: DragEvent) => {
                e.dataTransfer.setData(fileDrag.ITEM, i.id);
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
      <FolderDialogs dialog={dialog} folder={folder} items={items} parent={parent} onClose={() => setDialog(null)} put={put} drop={drop} setFolder={setFolder} reload={reload} />
      {preview && (
        <Suspense fallback={null}>
          <PreviewModal folder={folder} item={preview} files={files} onShow={setPreview} onDownload={download} onClose={() => setPreview(null)} />
        </Suspense>
      )}
    </div>
  );
}
