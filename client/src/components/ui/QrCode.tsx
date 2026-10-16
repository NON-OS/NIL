import './QrCode.css';
import { useMemo } from 'react';
import qr from '../../lib/qr';

const QUIET = 4;

// A QR code drawn in the page from lib/qr, so the link it holds never goes to an image service.
export default function QrCode({ value, label, size = 168 }: { value: string; label: string; size?: number }) {
  const { path, extent } = useMemo(() => {
    const modules = qr(value);
    let d = '';
    modules.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`)));
    return { path: d, extent: modules.length + QUIET * 2 };
  }, [value]);

  return (
    <svg className="qr-code" role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${extent} ${extent}`} shapeRendering="crispEdges">
      <rect width={extent} height={extent} />
      <path d={path} />
    </svg>
  );
}
