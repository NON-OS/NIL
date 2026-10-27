import { useEffect, useRef, type Ref } from 'react';
import cx from '../../lib/cx';

interface Props {
  stream: MediaStream | null;
  // your own camera is shown mirrored, the way a mirror would
  mirror?: boolean;
  fit?: 'cover' | 'contain';
  videoRef?: Ref<HTMLVideoElement>;
}

// A video picture from a stream. It never plays sound: call sound plays through CallAudio, so
// it can go to the speaker this person picked.
export default function VideoView({ stream, mirror = false, fit = 'cover', videoRef }: Props) {
  const own = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = own.current;
    if (!el || el.srcObject === stream) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream]);

  const setRef = (el: HTMLVideoElement | null) => {
    own.current = el;
    if (typeof videoRef === 'function') videoRef(el);
    else if (videoRef) (videoRef as { current: HTMLVideoElement | null }).current = el;
  };

  return <video ref={setRef} className={cx('call-video', mirror && 'mirror', fit === 'contain' && 'contain')} autoPlay playsInline muted aria-hidden="true" />;
}
