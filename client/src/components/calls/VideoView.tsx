import { useEffect, useRef, type Ref } from 'react';
import cx from '../../lib/cx';

interface Props {
  stream: MediaStream | null;
  // your own camera is shown mirrored, the way a mirror would
  mirror?: boolean;
  fit?: 'cover' | 'contain';
  videoRef?: Ref<HTMLVideoElement>;
  // told when a picture is showing, and when it stops, so a tile can show a face meanwhile
  onShowing?: (showing: boolean) => void;
}

// A video picture from a stream. It never plays sound: call sound plays through CallAudio, so
// it can go to the speaker this person picked.
export default function VideoView({ stream, mirror = false, fit = 'cover', videoRef, onShowing }: Props) {
  const own = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = own.current;
    if (!el || el.srcObject === stream) return;
    onShowing?.(false);
    el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream, onShowing]);

  // a picture counts once a frame of it has arrived; a track that goes quiet (muted by the
  // sender's browser, or a connection that stalls) stops counting
  useEffect(() => {
    const el = own.current;
    if (!el || !onShowing) return;
    const check = () => onShowing(el.videoWidth > 0 && !stream?.getVideoTracks().every((t) => t.muted || t.readyState === 'ended'));
    const tracks = stream?.getVideoTracks() ?? [];
    el.addEventListener('resize', check);
    el.addEventListener('loadeddata', check);
    tracks.forEach((t) => (t.addEventListener('mute', check), t.addEventListener('unmute', check)));
    check();
    return () => {
      el.removeEventListener('resize', check);
      el.removeEventListener('loadeddata', check);
      tracks.forEach((t) => (t.removeEventListener('mute', check), t.removeEventListener('unmute', check)));
    };
  }, [stream, onShowing]);

  const setRef = (el: HTMLVideoElement | null) => {
    own.current = el;
    if (typeof videoRef === 'function') videoRef(el);
    else if (videoRef) (videoRef as { current: HTMLVideoElement | null }).current = el;
  };

  return <video ref={setRef} className={cx('call-video', mirror && 'mirror', fit === 'contain' && 'contain')} autoPlay playsInline muted aria-hidden="true" />;
}
