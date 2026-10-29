import { RefreshCw, ShieldAlert } from 'lucide-react';
import Spinner from '../ui/Spinner';
import callSession from '../../actions/calls/callSession';
import confirmKeys from '../../actions/confirmKeys';
import type CallPeer from '../../types/CallPeer';

// What went wrong with a connection, and what to do about it, in words for the person in the call.
const REFUSED: Record<string, (name: string) => string> = {
  'no-key': (n) => `${n} hasn’t set up encryption keys yet, so Nil can’t check this connection is theirs. They get keys the first time they open Nil and unlock. Ask them to, then try again.`,
  theirs: (n) => `${n}’s browser couldn’t verify this connection and refused it. Ask them to check your key on their side, then try again.`,
  forged: (n) => `The connection wasn’t signed with the key you hold for ${n}, so Nil refused it. Their key may have changed: compare it with them before you try again.`,
  tampered: () => 'The connection details were changed on the way, so Nil refused it. Something between you, perhaps the server, interfered. Try again, and if it keeps happening, tell whoever runs your server.',
  frames: (n) => `Frames arrived in ${n}’s name that they didn’t send, so Nil stopped showing them for this call. Someone may be posing as them. Start a new call if you need to talk.`,
};

// A connection that isn't working right now, on its tile: connecting and reconnecting quietly,
// a refused one with the reason and a way forward.
export default function TileTrouble({ peer, name, compact }: { peer: CallPeer; name: string; compact: boolean }) {
  if (peer.link === 'connected') return null;

  if (peer.link !== 'refused') {
    const words = peer.link === 'connecting' ? 'Connecting…' : peer.link === 'lost' ? 'Connection lost. Still trying…' : 'Reconnecting…';
    return (
      <div className={peer.link === 'lost' ? 'call-tile-state lost' : 'call-tile-status'} role="status">
        {peer.link === 'lost' ? <RefreshCw aria-hidden="true" /> : <Spinner size={14} />}
        <span>{compact && peer.link === 'lost' ? 'Connection lost' : words}</span>
      </div>
    );
  }

  const why = (REFUSED[peer.refusal ?? ''] ?? (() => 'Nil couldn’t verify this connection, so it refused it. Check their key, then try again.'))(name);
  return (
    <div className="call-tile-state refused" role="alert">
      <ShieldAlert aria-hidden="true" />
      {compact ? (
        <p>Connection refused</p>
      ) : (
        <>
          <p className="call-tile-state-title">Nil stopped this connection</p>
          <p>{why}</p>
          <div className="call-tile-actions">
            {peer.refusal !== 'no-key' && (
              <button type="button" className="btn btn-sm" onClick={() => confirmKeys.show([peer.userId], 'this call')}>
                Check their keys
              </button>
            )}
            {peer.refusal !== 'frames' && (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => callSession.retry(peer.userId)}>
                Try again
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
