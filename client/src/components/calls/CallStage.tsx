import { useEffect, useState } from 'react';
import CallTile from './CallTile';
import useStore from '../../state/useStore';
import callRuntime from '../../actions/calls/callRuntime';
import cx from '../../lib/cx';
import type ActiveCall from '../../types/ActiveCall';

interface Tile {
  key: string;
  userId: string;
  screen: boolean;
}

// Everyone in the call, plus any shared screens: as an even grid, or with one large (the person
// pinned, a shared screen, or whoever spoke last) and the rest in a strip. With one other person
// and nothing shared, they fill the stage and you sit in a corner.
export default function CallStage({ call, onMainVideo }: { call: ActiveCall; onMainVideo: (el: HTMLVideoElement | null) => void }) {
  const me = useStore((s) => s.me?.id ?? '');
  const [lastSpeaker, setLastSpeaker] = useState<string | null>(null);
  const ringing = call.view.ringing;
  const peers = Object.values(call.peers);
  const speaking = peers.find((p) => p.speaking)?.userId ?? null;
  const pin = (key: string) => () => callRuntime.patch((a) => ({ pinned: a.pinned === key ? null : key, layout: a.pinned === key ? a.layout : 'speaker' }));

  useEffect(() => {
    if (speaking) setLastSpeaker(speaking);
  }, [speaking]);

  const tiles: Tile[] = [];
  for (const p of peers) {
    if (p.screen && p.screenMedia) tiles.push({ key: `${p.userId}:screen`, userId: p.userId, screen: true });
    tiles.push({ key: p.userId, userId: p.userId, screen: false });
  }
  if (call.screen) tiles.push({ key: `${me}:screen`, userId: me, screen: true });
  const sharing = tiles.find((t) => t.screen && t.userId !== me) ?? tiles.find((t) => t.screen);
  const mainKey = call.pinned && tiles.some((t) => t.key === call.pinned) ? call.pinned : sharing?.key ?? lastSpeaker ?? tiles[0]?.key ?? null;
  const duo = peers.length === 1 && !tiles.some((t) => t.screen);
  const speaker = call.layout === 'speaker' && !duo && tiles.length > 0;

  const render = (t: Tile, main = false) => {
    const peer = call.peers[t.userId];
    const mine = t.userId === me;
    return (
      <CallTile
        key={t.key}
        userId={t.userId}
        peer={mine ? undefined : peer}
        stream={t.screen ? (mine ? call.localScreen : peer?.screenMedia ?? null) : mine ? call.local : peer?.media ?? null}
        video={t.screen || (mine ? call.cam : Boolean(peer?.cam))}
        mic={mine ? call.mic : Boolean(peer?.mic)}
        speaking={mine ? call.speaking : Boolean(peer?.speaking)}
        screen={t.screen}
        pinned={call.pinned === t.key}
        onPin={tiles.length > 1 ? pin(t.key) : undefined}
        videoRef={main ? onMainVideo : undefined}
      />
    );
  };

  const self = <CallTile userId={me} stream={call.local} video={call.cam} mic={call.mic} speaking={call.speaking} />;

  if (!tiles.length) {
    return (
      <div className="call-stage waiting">
        <div className="call-self-alone">{self}</div>
        <p className="call-waiting" role="status">
          {ringing.length ? 'Ringing…' : 'Waiting for others to join.'}
        </p>
      </div>
    );
  }

  if (duo || speaker) {
    const main = tiles.find((t) => t.key === mainKey) ?? tiles[0];
    const rest = tiles.filter((t) => t !== main);
    return (
      <div className={cx('call-stage', duo ? 'duo' : 'speaker')}>
        <div className="call-main">{render(main, true)}</div>
        {duo ? (
          <div className="call-self-corner">{self}</div>
        ) : (
          <div className="call-strip">
            {rest.map((t) => render(t))}
            {self}
          </div>
        )}
      </div>
    );
  }

  const count = tiles.length + 1;
  return (
    <div className="call-stage grid" style={{ ['--cols' as string]: count <= 1 ? 1 : count <= 4 ? 2 : 3 }}>
      {tiles.map((t, i) => render(t, i === 0))}
      {self}
    </div>
  );
}
