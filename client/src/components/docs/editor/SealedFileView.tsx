import { lazy, Suspense, useState } from 'react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { Download, Eye } from 'lucide-react';
import FileIcon from '../../files/FileIcon';
import docBlobs from '../../../actions/docBlobs';
import saveBlob from '../../../lib/saveBlob';
import fileSize from '../../../lib/fileSize';
import previewKind from '../../../lib/previewKind';
import toast from '../../../state/toast';
import sealedAttrs from '../../../lib/docState/sealedAttrs';

const DocFilePreview = lazy(() => import('./DocFilePreview'));

// A file attached in a doc: its name and size, a preview for what the browser can show, and a
// download, all decrypted in this tab.
export default function SealedFileView({ node, selected }: ReactNodeViewProps) {
  const { blob, key, mime, name, size } = sealedAttrs(node.attrs);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const canPreview = previewKind(mime ?? '', name ?? '') !== 'none';

  const download = async () => {
    setBusy(true);
    try {
      saveBlob(await docBlobs.read({ blob, key, mime }), name || 'file');
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <NodeViewWrapper className={`doc-file${selected ? ' is-selected' : ''}`} data-drag-handle="">
      <span className="doc-file-icon">
        <FileIcon kind="file" type={mime ?? ''} name={name ?? ''} />
      </span>
      <span className="doc-file-name">
        <strong title={name}>{name || 'File'}</strong>
        {size ? <small className="num">{fileSize(size)}</small> : null}
      </span>
      {canPreview && (
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPreviewing(true)} aria-label={`Preview ${name}`}>
          <Eye /> Preview
        </button>
      )}
      <button type="button" className="btn btn-sm btn-ghost" onClick={download} disabled={busy} aria-label={`Download ${name}`}>
        <Download />
      </button>
      {previewing && (
        <Suspense fallback={null}>
          <DocFilePreview file={{ blob, key, mime, name, size }} onClose={() => setPreviewing(false)} />
        </Suspense>
      )}
    </NodeViewWrapper>
  );
}
