import '../../files/Files.css';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Download, ShieldCheck, X } from 'lucide-react';
import Modal from '../../ui/Modal';
import Spinner from '../../ui/Spinner';
import MediaPreview from '../../files/preview/MediaPreview';
import docBlobs from '../../../actions/docBlobs';
import previewKind from '../../../lib/previewKind';
import saveBlob from '../../../lib/saveBlob';
import fileSize from '../../../lib/fileSize';

const ImagePreview = lazy(() => import('../../files/preview/ImagePreview'));
const PdfPreview = lazy(() => import('../../files/preview/PdfPreview'));
const DocxPreview = lazy(() => import('../../files/preview/DocxPreview'));
const TextPreview = lazy(() => import('../../files/preview/TextPreview'));

interface Props {
  file: { blob: string; key: string; mime: string; name: string; size: number | null };
  onClose: () => void;
}

// A file attached in a doc, shown in the browser after decrypting it here, with the same viewers
// Files uses.
export default function DocFilePreview({ file, onClose }: Props) {
  const kind = previewKind(file.mime ?? '', file.name ?? '');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const stop = new AbortController();
    docBlobs
      .read(file, { signal: stop.signal, onProgress: setProgress })
      .then(setBlob)
      .catch((err) => !stop.signal.aborted && setError(err instanceof Error ? err.message : 'This file couldn’t be opened.'));
    return () => stop.abort();
  }, [file.blob]);

  const body = () => {
    if (error) return <p className="files-placeholder">{error}</p>;
    if (!blob) {
      return (
        <div className="files-placeholder" role="status">
          <Spinner size={20} />
          <span>
            Decrypting… <span className="num">{Math.round(progress * 100)}%</span>
          </span>
        </div>
      );
    }
    if (kind === 'image') return <ImagePreview blob={blob} name={file.name} />;
    if (kind === 'pdf') return <PdfPreview blob={blob} />;
    if (kind === 'docx') return <DocxPreview blob={blob} />;
    if (kind === 'audio' || kind === 'video') return <MediaPreview blob={blob} video={kind === 'video'} name={file.name} />;
    return <TextPreview blob={blob} markdown={kind === 'markdown'} />;
  };

  return (
    <Modal onClose={onClose} width={1120} label={`Preview of ${file.name}`}>
      <div className="files-preview">
        <div className="files-preview-head">
          <div className="files-preview-title">
            <h2 title={file.name}>{file.name}</h2>
            <small>
              <ShieldCheck size={12} aria-hidden="true" /> Decrypted in this browser{file.size ? <> · <span className="num">{fileSize(file.size)}</span></> : null}
            </small>
          </div>
          <button type="button" className="icon-btn" onClick={() => blob && saveBlob(blob, file.name)} disabled={!blob} aria-label="Download">
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
