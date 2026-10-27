import '../Files.css';
import { useState } from 'react';
import useObjectUrl from '../../../hooks/useObjectUrl';

// Audio and video, decrypted, played from a blob: URL with the browser's own controls. A format
// this browser can't play says so, and the file can still be downloaded.
export default function MediaPreview({ blob, video, name }: { blob: Blob; video: boolean; name: string }) {
  const url = useObjectUrl(blob);
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="files-placeholder">This browser can’t play this file. Download it to play it in another app.</div>;
  if (!url) return null;
  return (
    <div className="files-media">
      {video ? <video src={url} controls playsInline preload="metadata" aria-label={name} onError={() => setFailed(true)} /> : <audio src={url} controls preload="metadata" aria-label={name} onError={() => setFailed(true)} />}
    </div>
  );
}
