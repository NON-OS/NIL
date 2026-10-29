import { useCallback, useState } from 'react';
import { MicOff, Pin, PinOff } from 'lucide-react';
import Avatar from '../ui/Avatar';
import VideoView from './VideoView';
import TrustBadge from './TrustBadge';
import QualityBars from './QualityBars';
import TileTrouble from './TileTrouble';
import useStore from '../../state/useStore';
import cx from '../../lib/cx';
import type CallPeer from '../../types/CallPeer';

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
  // a tile in the strip or the corner: a smaller face, and the name only
  compact?: boolean;
  style?: React.CSSProperties;
}

// One person, or one shared screen, in the call: their picture, or their face until a picture
// arrives, with a name plate saying whether they're muted, whose key it is and how the
// connection is doing.
export default function CallTile({ userId, peer, stream, video, mic, speaking, screen = false, pinned = false, onPin, videoRef, compact = false, style }: Props) {
  const user = useStore((s) => s.users[userId]);
  const me = useStore((s) => s.me?.id === userId);
  const [showing, setShowing] = useState(false);
  const onShowing = useCallback((on: boolean) => setShowing(on), []);
  const name = me ? 'You' : user?.name ?? 'Someone';
  const label = screen ? `${me ? 'Your' : `${name}’s`} screen` : name;
  const picture = video && stream;
  // waiting on them: they haven't let this person see or hear them yet
  const waiting = peer && peer.holding && !screen && peer.link !== 'refused';

  return (
    <figure className={cx('call-tile', speaking && !screen && 'speaking', screen && 'screen', compact && 'compact', picture && showing && 'live')} aria-label={label} style={style}>
      {picture && <VideoView stream={stream} mirror={me && !screen} fit={screen ? 'contain' : 'cover'} videoRef={videoRef} onShowing={onShowing} />}
      {!(picture && showing) && (
        <div className="call-tile-face">
          <Avatar user={user} size={compact ? 44 : 88} />
          {!compact && waiting && <p className="call-tile-note">Waiting for {name} to check your key</p>}
          {!compact && !waiting && picture && !screen && peer?.link === 'connected' && <p className="call-tile-note">Waiting for {name}’s picture…</p>}
        </div>
      )}
      {peer && !screen && <TileTrouble peer={peer} name={name} compact={compact} />}
      <figcaption className="call-tile-name">
        {!mic && !screen && <MicOff className="call-tile-muted" aria-label="Muted" />}
        <span className="call-tile-label">{label}</span>
        {peer && !screen && !compact && <TrustBadge peer={peer} name={name} />}
        {peer && peer.held && !screen && peer.link !== 'refused' && <span className="call-tile-chip">Can’t hear you</span>}
        {peer && !screen && peer.link === 'connected' && <QualityBars quality={peer.quality} />}
      </figcaption>
      {onPin && !compact && (
        <button type="button" className="call-pin" onClick={onPin} aria-pressed={pinned} aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`} title={pinned ? 'Unpin' : 'Pin'}>
          {pinned ? <PinOff /> : <Pin />}
        </button>
      )}
    </figure>
  );
}
