import { MicOff, Pin, PinOff, RefreshCw } from 'lucide-react';
import Avatar from '../ui/Avatar';
import Spinner from '../ui/Spinner';
import VideoView from './VideoView';
import TrustBadge from './TrustBadge';
import QualityBars from './QualityBars';
import useStore from '../../state/useStore';
import cx from '../../lib/cx';
import callSession from '../../actions/calls/callSession';
import confirmKeys from '../../actions/confirmKeys';
import type CallPeer from '../../types/CallPeer';

const REFUSED: Record<string, string> = {
  'no-key': 'hasn’t set up encryption keys, so Nil can’t check this connection is theirs.',
  theirs: 'Their browser couldn’t verify this connection and refused it.',
  forged: 'The connection wasn’t signed with the key you hold for them, so Nil refused it.',
  tampered: 'The connection details were changed on the way, so Nil refused it.',
  frames: 'Frames arrived in their name that they didn’t send, so Nil stopped showing them for this call.',
};

interface Props {
  userId: string;
  // someone else in the call; left out for your own tile
  peer?: CallPeer;
  stream: MediaStream | null;
  video: boolean;
  mic: boolean;
  speaking: boolean;
  screen?: boolean;
  pinned?: boolean;
  onPin?: () => void;
  videoRef?: (el: HTMLVideoElement | null) => void;
  // a tile in the strip or the corner, with a smaller picture when there's no video
  compact?: boolean;
}

// One person, or one shared screen, in the call.
export default function CallTile({ userId, peer, stream, video, mic, speaking, screen = false, pinned = false, onPin, videoRef, compact = false }: Props) {
  const user = useStore((s) => s.users[userId]);
  const me = useStore((s) => s.me?.id === userId);
  const name = me ? 'You' : user?.name ?? 'Someone';
  const label = screen ? `${me ? 'Your' : `${name}’s`} screen` : name;
  const trouble = peer && peer.link !== 'connected';

  return (
    <figure className={cx('call-tile', speaking && !screen && 'speaking', screen && 'screen')} aria-label={label}>
      {video && stream ? <VideoView stream={stream} mirror={me && !screen} fit={screen ? 'contain' : 'cover'} videoRef={videoRef} /> : <Avatar user={user} size={compact ? 36 : 72} />}
      {trouble && peer.link !== 'refused' && (
        <div className="call-tile-state" role="status">
          {peer.link === 'lost' ? <RefreshCw aria-hidden="true" /> : <Spinner size={18} />}
          <span>{peer.link === 'connecting' ? 'Connecting…' : peer.link === 'lost' ? 'Connection lost. Still trying…' : 'Reconnecting…'}</span>
        </div>
      )}
      {peer && peer.held && !screen && peer.link !== 'refused' && (
        <div className="call-held" role="status">
          <p>{compact ? 'Can’t hear you yet' : `${name} can’t see or hear you yet: you haven’t confirmed their key.`}</p>
          {!compact && (
            <div className="call-tile-actions">
              {peer.trust !== 'none' && (
                <button type="button" className="btn btn-sm" onClick={() => confirmKeys.show([userId], 'this call')}>
                  Check their keys
                </button>
              )}
              <button type="button" className="btn btn-sm" onClick={() => callSession.allow(userId)}>
                Talk anyway
              </button>
            </div>
          )}
        </div>
      )}
      {peer && !peer.held && peer.holding && !screen && <p className="call-held-them">Waiting for {name} to check your key</p>}
      {peer?.link === 'refused' && (
        <div className="call-tile-state refused" role="alert">
          <p>
            {peer.refusal === 'no-key' ? `${name} ` : ''}
            {REFUSED[peer.refusal ?? ''] ?? 'Nil couldn’t verify this connection, so it refused it.'}
          </p>
          <div className="call-tile-actions">
            {peer.refusal !== 'no-key' && (
              <button type="button" className="btn btn-sm" onClick={() => confirmKeys.show([userId], 'this call')}>
                Check their keys
              </button>
            )}
            {peer.refusal !== 'frames' && (
              <button type="button" className="btn btn-sm" onClick={() => callSession.retry(userId)}>
                Try again
              </button>
            )}
          </div>
        </div>
      )}
      <figcaption className="call-tile-name">
        {!mic && !screen && <MicOff aria-label="Muted" />}
        <span>{label}</span>
        {peer && !screen && <TrustBadge peer={peer} name={name} />}
        {peer && !screen && peer.link === 'connected' && <QualityBars quality={peer.quality} />}
      </figcaption>
      {onPin && !compact && (
        <button type="button" className="icon-btn call-pin" onClick={onPin} aria-pressed={pinned} aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}>
          {pinned ? <PinOff /> : <Pin />}
        </button>
      )}
    </figure>
  );
}
