import { useEffect, useState } from 'react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { ImageOff } from 'lucide-react';
import docBlobs from '../../../actions/docBlobs';
import sealedAttrs from '../../../lib/docState/sealedAttrs';

// An image in a doc, decrypted in this tab while it's on screen. Its address is a blob: URL that
// lives only as long as the image is shown.
export default function SealedImageView({ node, selected, editor, updateAttributes }: ReactNodeViewProps) {
  const { blob, key, mime, alt, name, width, height } = sealedAttrs(node.attrs);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!blob || !key) return setFailed(true);
    const stop = new AbortController();
    let made: string | null = null;
    docBlobs
      .read({ blob, key, mime }, { signal: stop.signal })
      .then((b) => {
        made = URL.createObjectURL(b);
        setUrl(made);
      })
      .catch(() => !stop.signal.aborted && setFailed(true));
    return () => {
      stop.abort();
      if (made) URL.revokeObjectURL(made);
    };
  }, [blob, key, mime]);

  const ratio = width && height ? `${width} / ${height}` : undefined;
  return (
    <NodeViewWrapper as="figure" className={`doc-image${selected ? ' is-selected' : ''}`} data-drag-handle="">
      {url ? (
        <img src={url} alt={alt || name || ''} width={width ?? undefined} height={height ?? undefined} draggable={false} />
      ) : failed ? (
        <div className="doc-image-missing" role="img" aria-label="Image that couldn’t be opened">
          <ImageOff /> This image couldn’t be opened.
        </div>
      ) : (
        <div className="doc-image-loading" style={{ aspectRatio: ratio }} aria-busy="true" aria-label="Decrypting image" />
      )}
      {selected && editor.isEditable && (
        <input className="doc-image-alt" value={alt ?? ''} maxLength={300} onChange={(e) => updateAttributes({ alt: e.target.value })} placeholder="Describe this image for people who can’t see it" aria-label="Image description" />
      )}
    </NodeViewWrapper>
  );
}
