import { useMemo } from 'react';
import encodeQr from '../../lib/qr/encodeQr';

const QUIET = 4;

// A QR code drawn as one SVG path, encoded right here in the browser. Dark modules on white
// with the standard four-module quiet zone, which phone cameras need to find it.
export default function QrCode({ text, label, size = 196 }: { text: string; label: string; size?: number }) {
  const { path, extent } = useMemo(() => {
    const modules = encodeQr(text);
    let d = '';
    modules.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`)));
    return { path: d, extent: modules.length + QUIET * 2 };
  }, [text]);
  return (
    <svg className="qr" role="img" aria-label={label} width={size} height={size} viewBox={`0 0 ${extent} ${extent}`} shapeRendering="crispEdges">
      <rect width={extent} height={extent} className="qr-paper" />
      <path d={path} className="qr-ink" />
    </svg>
  );
}
