import '../Files.css';
import { useEffect, useState } from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import useObjectUrl from '../../../hooks/useObjectUrl';
import cx from '../../../lib/cx';

const STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

// A decrypted image, fitted to the window or zoomed with the buttons, + and -, and 0 to fit.
// Zoomed in, it scrolls.
export default function ImagePreview({ blob, name }: { blob: Blob; name: string }) {
  const url = useObjectUrl(blob);
  const [zoom, setZoom] = useState<number | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const step = (dir: 1 | -1) => setZoom((z) => {
    const now = z ?? 1;
    return (dir > 0 ? STEPS.find((s) => s > now) : [...STEPS].reverse().find((s) => s < now)) ?? now;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') step(1);
      else if (e.key === '-') step(-1);
      else if (e.key === '0') setZoom(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="files-viewer">
      <div className="files-viewer-bar">
        <button type="button" className="icon-btn" onClick={() => step(-1)} aria-label="Zoom out">
          <ZoomOut />
        </button>
        <span className="num" aria-live="polite" style={{ minWidth: 52, textAlign: 'center' }}>
          {zoom === null ? 'Fit' : `${Math.round(zoom * 100)}%`}
        </span>
        <button type="button" className="icon-btn" onClick={() => step(1)} aria-label="Zoom in">
          <ZoomIn />
        </button>
        <button type="button" className="icon-btn" onClick={() => setZoom(null)} aria-label="Fit to window" aria-pressed={zoom === null}>
          <Maximize2 />
        </button>
        {natural && <span className="muted num">{`${natural.width} × ${natural.height}`}</span>}
      </div>
      <div className="files-viewer-scroll">
        <div className={cx('files-zoom', zoom === null && 'fit')} onDoubleClick={() => setZoom((z) => (z === null ? 1 : null))}>
          {url && <img src={url} alt={name} style={zoom === null || !natural ? undefined : { width: natural.width * zoom }} onLoad={(e) => setNatural({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} />}
        </div>
      </div>
    </div>
  );
}
