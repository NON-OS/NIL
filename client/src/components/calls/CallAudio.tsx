import { useEffect, useRef } from 'react';
import useCallStore from '../../state/useCallStore';
import type CallPeer from '../../types/CallPeer';

function PeerAudio({ peer, speaker }: { peer: CallPeer; speaker: string | null }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = peer.media;
    if (peer.media) void el.play().catch(() => {});
  }, [peer.media]);

  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (el?.setSinkId && speaker) void el.setSinkId(speaker).catch(() => {});
  }, [speaker]);

  return <audio ref={ref} autoPlay />;
}

// Everyone's voice in the call, one hidden player each, so sound goes on while the call is
// minimized or in picture-in-picture, and to the speaker this person picked.
export default function CallAudio() {
  const peers = useCallStore((s) => s.active?.peers);
  const speaker = useCallStore((s) => s.active?.speaker ?? null);
  if (!peers) return null;
  return (
    <div hidden>
      {Object.values(peers).map((p) => (
        <PeerAudio key={`${p.userId}:${p.session}`} peer={p} speaker={speaker} />
      ))}
    </div>
  );
}
