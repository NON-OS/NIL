import { useMemo } from 'react';
import { LayoutGrid, Mic, MicOff, Minimize2, MonitorUp, PhoneOff, PictureInPicture2, Rows3, Settings2, UserPlus, Video, VideoOff } from 'lucide-react';
import Picker from '../ui/Picker';
import Avatar from '../ui/Avatar';
import useStore from '../../state/useStore';
import useCallStore from '../../state/useCallStore';
import callStore from '../../state/callStore';
import toast from '../../state/toast';
import callMedia from '../../actions/calls/callMedia';
import callSession from '../../actions/calls/callSession';
import callRuntime from '../../actions/calls/callRuntime';
import callApi from '../../actions/calls/callApi';
import localMedia from '../../actions/calls/localMedia';
import cx from '../../lib/cx';
import type ActiveCall from '../../types/ActiveCall';

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

function Control({ label, keys, pressed, danger, onClick, children, disabled }: { label: string; keys?: string; pressed?: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className={cx('call-control', pressed === false && 'off', danger && 'danger')} onClick={onClick} aria-label={label} aria-pressed={pressed} aria-keyshortcuts={keys} title={keys ? `${label} (${keys.replace('Control+', mod).replace('Meta+', mod)})` : label} disabled={disabled}>
      {children}
    </button>
  );
}

// The buttons along the bottom of a call. Microphone and camera show what they're doing now:
// pressed while on.
export default function CallControls({ call, onPip }: { call: ActiveCall; onPip: (() => void) | null }) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me?.id);
  const max = useCallStore((s) => s.settings?.maxPeers ?? 6);
  const taken = new Set([...call.view.members.map((m) => m.userId), ...call.view.ringing]);
  const room = max - taken.size;
  const people = useMemo(
    () =>
      Object.values(users)
        .filter((u) => u.kind !== 'agent' && !u.deactivated && u.role !== 'guest' && u.id !== me && !taken.has(u.id))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((u) => ({ value: u.id, label: u.name, icon: <Avatar user={u} size={18} /> })),
    [users, me, call.view],
  );

  const invite = (userId: string) => callApi.invite(call.id, [userId]).then((r) => toast.show(r.rung.length ? `Calling ${users[userId]?.name ?? 'them'}…` : 'They can’t be added to this call.'), toast.error);

  return (
    <div className="call-controls" role="toolbar" aria-label="Call controls">
      <Control label={call.mic ? 'Mute' : 'Unmute'} keys="Control+D Meta+D" pressed={call.mic} onClick={callMedia.toggleMic}>
        {call.mic ? <Mic /> : <MicOff />}
      </Control>
      <Control label={call.cam ? 'Turn camera off' : 'Turn camera on'} keys="Control+E Meta+E" pressed={call.cam} onClick={() => void callMedia.toggleCam()}>
        {call.cam ? <Video /> : <VideoOff />}
      </Control>
      {localMedia.canShareScreen() && (
        <Control label={call.screen ? 'Stop sharing your screen' : 'Share your screen'} keys="S" pressed={call.screen} onClick={() => void callMedia.toggleScreen()}>
          <MonitorUp />
        </Control>
      )}
      <Control label={call.layout === 'grid' ? 'Speaker layout' : 'Grid layout'} keys="L" onClick={() => callRuntime.patch((a) => ({ layout: a.layout === 'grid' ? 'speaker' : 'grid', pinned: null }))}>
        {call.layout === 'grid' ? <Rows3 /> : <LayoutGrid />}
      </Control>
      {room > 0 && people.length > 0 && (
        <Picker options={people} value={null} onChange={(id) => void invite(id)} title="Add someone to the call" className="call-control" align="start">
          <UserPlus />
        </Picker>
      )}
      <Control label="Microphone, camera and speaker" onClick={() => callStore.set({ devices: { open: true, join: null } })}>
        <Settings2 />
      </Control>
      {onPip && (
        <Control label="Picture in picture" keys="P" onClick={onPip}>
          <PictureInPicture2 />
        </Control>
      )}
      <Control label="Minimize the call" keys="Escape" onClick={() => callRuntime.patch(() => ({ minimized: true }))}>
        <Minimize2 />
      </Control>
      <Control label="Leave the call" danger onClick={callSession.leave}>
        <PhoneOff />
      </Control>
    </div>
  );
}
