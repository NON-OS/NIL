import '../Files.css';
import { useState } from 'react';
import useObjectUrl from '../../../hooks/useObjectUrl';

// Audio and video with the browser's own controls: streamed as they arrive from `src` (see
// mediaStreams), or played from a file already decrypted whole. A format this browser can't play
// says so, and the file can still be downloaded.
export default function MediaPreview({ blob, src, video, name, onStreamFailed }: { blob?: Blob; src?: string; video: boolean; name: string; onStreamFailed?: () => void }) {
  const whole = useObjectUrl(blob ?? null);
  const url = src ?? whole;
  const [failed, setFailed] = useState(false);
  // a browser whose player won't take a stream gets the file decrypted whole instead, if it can
  const fail = () => (src && onStreamFailed ? onStreamFailed() : setFailed(true));
  if (failed) return <div className="files-placeholder">This browser can’t play this file. Download it to play it in another app.</div>;
  if (!url) return null;
  return (
    <div className="files-media">
      {video ? <video src={url} controls playsInline preload="metadata" aria-label={name} onError={fail} /> : <audio src={url} controls preload="metadata" aria-label={name} onError={fail} />}
    </div>
  );
}
