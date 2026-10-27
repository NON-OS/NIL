import { useMemo, useRef, useState } from 'react';
import { Ellipsis, LayoutGrid, Mic, MicOff, Minimize2, MonitorUp, PhoneOff, PictureInPicture2, Rows3, Settings2, UserPlus, Video, VideoOff } from 'lucide-react';
import Picker from '../ui/Picker';
import Popover from '../ui/Popover';
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
import media from '../../lib/media';
import useMediaQuery from '../../hooks/useMediaQuery';
import type ActiveCall from '../../types/ActiveCall';

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

// The label says what a button will do, so it carries the state for screen readers; `on` fills
// it in cyan, and `muted` marks a microphone or camera that's off in red, so nobody talks into
// a muted call by mistake.
function Control({ label, keys, on, muted, danger, onClick, children, disabled }: { label: string; keys?: string; on?: boolean; muted?: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className={cx('call-control', on && 'on', muted && 'off', danger && 'danger')} onClick={onClick} aria-label={label} aria-keyshortcuts={keys} title={keys ? `${label} (${keys.replace('Control+', mod).replace('Meta+', mod)})` : label} disabled={disabled}>
      {children}
    </button>
  );
}

// The buttons along the bottom of a call.
export default function CallControls({ call, onPip }: { call: ActiveCall; onPip: (() => void) | null }) {
  const users = useStore((s) => s.users);
  const me = useStore((s) => s.me?.id);
  const phone = useMediaQuery(media.phone);
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
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

  const more = [
    localMedia.canShareScreen() && { label: call.screen ? 'Stop sharing your screen' : 'Share your screen', keys: 'S', on: call.screen, icon: <MonitorUp />, run: () => void callMedia.toggleScreen() },
    { label: call.layout === 'grid' ? 'Speaker layout' : 'Grid layout', keys: 'L', icon: call.layout === 'grid' ? <Rows3 /> : <LayoutGrid />, run: () => callRuntime.patch((a) => ({ layout: a.layout === 'grid' ? 'speaker' : 'grid', pinned: null })) },
    { label: 'Microphone, camera and speaker', icon: <Settings2 />, run: () => callStore.set({ devices: { open: true, join: null } }) },
    onPip && { label: 'Picture in picture', keys: 'P', icon: <PictureInPicture2 />, run: onPip },
    { label: 'Minimize the call', keys: 'Escape', icon: <Minimize2 />, run: () => callRuntime.patch(() => ({ minimized: true })) },
  ].filter((c): c is Exclude<typeof c, false | null> => Boolean(c));

  return (
    <div className="call-controls" role="toolbar" aria-label="Call controls">
      <Control label={call.mic ? 'Mute' : 'Unmute'} keys="Control+D Meta+D" on={call.mic} muted={!call.mic} onClick={callMedia.toggleMic}>
        {call.mic ? <Mic /> : <MicOff />}
      </Control>
      <Control label={call.cam ? 'Turn camera off' : 'Turn camera on'} keys="Control+E Meta+E" on={call.cam} muted={!call.cam} onClick={() => void callMedia.toggleCam()}>
        {call.cam ? <Video /> : <VideoOff />}
      </Control>
      {room > 0 && people.length > 0 && (
        <Picker options={people} value={null} onChange={(id) => void invite(id)} title="Add someone to the call" className="call-control" align="start">
          <UserPlus />
        </Picker>
      )}
      {/* on a phone the rest sit behind one button, so the bar stays one row */}
      {phone ? (
        <>
          <button ref={moreRef} type="button" className="call-control" onClick={() => setOpen((o) => !o)} aria-label="More call controls" aria-haspopup="true" aria-expanded={open}>
            <Ellipsis />
          </button>
          <Popover anchor={moreRef} open={open} onClose={() => setOpen(false)} width={260} align="end">
            <div className="call-menu">
              {more.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  className="call-menu-item"
                  onClick={() => {
                    setOpen(false);
                    c.run();
                  }}
                >
                  {c.icon} {c.label}
                </button>
              ))}
            </div>
          </Popover>
        </>
      ) : (
        more.map((c) => (
          <Control key={c.label} label={c.label} keys={c.keys} on={'on' in c ? c.on : undefined} onClick={c.run}>
            {c.icon}
          </Control>
        ))
      )}
      <Control label="Leave the call" danger onClick={callSession.leave}>
        <PhoneOff />
      </Control>
    </div>
  );
}
