import '../Files.css';
import { lazy, Suspense, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ShieldCheck, X } from 'lucide-react';
import Modal from '../../ui/Modal';
import Spinner from '../../ui/Spinner';
import NoPreview from './NoPreview';
import MediaPreview from './MediaPreview';
import fileDownload from '../../../actions/fileDownload';
import previewKind from '../../../lib/previewKind';
import saveBlob from '../../../lib/saveBlob';
import fileSize from '../../../lib/fileSize';
import type FolderItem from '../../../types/FolderItem';
import type SharedFolder from '../../../types/SharedFolder';

// Each viewer, and the library behind it, loads the first time a file of its kind is opened.
const ImagePreview = lazy(() => import('./ImagePreview'));
const PdfPreview = lazy(() => import('./PdfPreview'));
const DocxPreview = lazy(() => import('./DocxPreview'));
const TextPreview = lazy(() => import('./TextPreview'));

// Previews decrypt the whole file into this tab first, so they stop at a size a tab handles
// comfortably; text stops much sooner, since a huge log is no use on screen.
const MAX_PREVIEW = 300 * 1024 * 1024;
const MAX_TEXT = 2 * 1024 * 1024;

interface Props {
  folder: SharedFolder;
  item: FolderItem;
  // the files around it, in the order shown, for the previous and next buttons
  files: FolderItem[];
  onShow: (item: FolderItem) => void;
  onDownload: (item: FolderItem) => void;
  onClose: () => void;
}

// A file shown in the browser after decrypting it here. Left and right arrows move through the
// folder's files; nothing is sent anywhere to show them.
export default function PreviewModal({ folder, item, files, onShow, onDownload, onClose }: Props) {
  const kind = previewKind(item.type, item.name);
  const tooLarge = item.size > (kind === 'text' || kind === 'markdown' ? MAX_TEXT : MAX_PREVIEW);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const at = files.findIndex((f) => f.id === item.id);
  const prev = at > 0 ? files[at - 1] : null;
  const next = at >= 0 && at < files.length - 1 ? files[at + 1] : null;

  useEffect(() => {
    setBlob(null);
    setError('');
    setProgress(0);
    if (kind === 'none' || tooLarge) return;
    const stop = new AbortController();
    fileDownload
      .read(folder, item, { signal: stop.signal, onProgress: setProgress })
      .then(setBlob)
      .catch((err) => !stop.signal.aborted && setError(err instanceof Error ? err.message : 'This file couldn’t be opened.'));
    return () => stop.abort();
  }, [item.id, folder.keyHash]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).matches?.('input, textarea')) return;
      if (e.key === 'ArrowLeft' && prev) onShow(prev);
      else if (e.key === 'ArrowRight' && next) onShow(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onShow]);

  // a file already decrypted for the preview is saved from memory, not fetched again
  const save = () => (blob ? saveBlob(blob, item.name) : onDownload(item));

  const body = () => {
    if (kind === 'none') return <NoPreview item={item} onDownload={() => onDownload(item)} />;
    if (tooLarge) return <NoPreview item={item} note="This file is too large to preview here. Download it to open it on your device." onDownload={() => onDownload(item)} />;
    if (error) return <NoPreview item={item} note={error} onDownload={() => onDownload(item)} />;
    if (!blob) {
      return (
        <div className="files-placeholder" role="status">
          <Spinner size={20} />
          <span>Decrypting… <span className="num">{Math.round(progress * 100)}%</span></span>
        </div>
      );
    }
    if (kind === 'image') return <ImagePreview blob={blob} name={item.name} />;
    if (kind === 'pdf') return <PdfPreview blob={blob} />;
    if (kind === 'docx') return <DocxPreview blob={blob} />;
    if (kind === 'audio' || kind === 'video') return <MediaPreview blob={blob} video={kind === 'video'} name={item.name} />;
    return <TextPreview blob={blob} markdown={kind === 'markdown'} />;
  };

  return (
    <Modal onClose={onClose} width={1120} label={`Preview of ${item.name}`}>
      <div className="files-preview">
        <div className="files-preview-head">
          <div className="files-preview-title">
            <h2 title={item.name}>{item.name}</h2>
            <small>
              <ShieldCheck size={12} aria-hidden="true" /> Decrypted in this browser · <span className="num">{fileSize(item.size)}</span>
            </small>
          </div>
          <button type="button" className="icon-btn" onClick={() => prev && onShow(prev)} disabled={!prev} aria-label="Previous file">
            <ChevronLeft />
          </button>
          <button type="button" className="icon-btn" onClick={() => next && onShow(next)} disabled={!next} aria-label="Next file">
            <ChevronRight />
          </button>
          <button type="button" className="icon-btn" onClick={save} aria-label="Download">
            <Download />
          </button>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close preview">
            <X />
          </button>
        </div>
        <div className="files-preview-body">
          <Suspense
            fallback={
              <div className="files-placeholder">
                <Spinner size={20} />
              </div>
            }
          >
            {body()}
          </Suspense>
        </div>
      </div>
    </Modal>
  );
}
