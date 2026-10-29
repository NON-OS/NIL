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
const shortcut = (keys?: string) => (keys ? keys.split(' ')[0].replace('Control+', mod).replace('Escape', 'Esc') : '');

// One round button. Its label says what it will do and shows on hover and focus, with the
// shortcut; `off` fills a microphone or camera that's off in white, and `on` fills what you're
// doing, like sharing your screen, in cyan.
function Control({ label, keys, on, off, onClick, children, disabled }: { label: string; keys?: string; on?: boolean; off?: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  const tip = keys ? `${label} · ${shortcut(keys)}` : label;
  return (
    <button type="button" className={cx('call-control', on && 'on', off && 'off')} onClick={onClick} aria-label={label} aria-keyshortcuts={keys} data-tip={tip} disabled={disabled}>
      {children}
    </button>
  );
}

// The buttons along the bottom of a call: your microphone and camera, what you can do in the
// call, and leaving it. On a phone the middle group sits behind one button, so the bar stays one
// row within reach of a thumb.
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

  const invite = (userId: string) => callApi.invite(call.id, [userId]).then((r) => toast.show(r.rung.length ? `Calling ${users[userId]?.name ?? 'them'}…` : `${users[userId]?.name ?? 'They'} can’t be added to this call right now.`), toast.error);

  const tools = [
    localMedia.canShareScreen() && { label: call.screen ? 'Stop sharing your screen' : 'Share your screen', keys: 'S', on: call.screen, icon: <MonitorUp />, run: () => void callMedia.toggleScreen() },
    { label: call.layout === 'grid' ? 'Speaker layout' : 'Grid layout', keys: 'L', icon: call.layout === 'grid' ? <Rows3 /> : <LayoutGrid />, run: () => callRuntime.patch((a) => ({ layout: a.layout === 'grid' ? 'speaker' : 'grid', pinned: null })) },
    { label: 'Microphone, camera and speaker', icon: <Settings2 />, run: () => callStore.set({ devices: { open: true, join: null } }) },
    onPip && { label: 'Picture in picture', keys: 'P', icon: <PictureInPicture2 />, run: onPip },
  ].filter((c): c is Exclude<typeof c, false | null> => Boolean(c));
  const minimize = { label: 'Minimize the call', keys: 'Escape', icon: <Minimize2 />, run: () => callRuntime.patch(() => ({ minimized: true })) };
  const add = room > 0 && people.length > 0 && (
    <Picker options={people} value={null} onChange={(id) => void invite(id)} title="Add someone to the call" className="call-control" align="start">
      <UserPlus />
    </Picker>
  );

  return (
    <div className="call-controls" role="toolbar" aria-label="Call controls">
      <div className="call-controls-group">
        <Control label={call.mic ? 'Mute' : 'Unmute'} keys="Control+D Meta+D" off={!call.mic} onClick={callMedia.toggleMic}>
          {call.mic ? <Mic /> : <MicOff />}
        </Control>
        <Control label={call.cam ? 'Turn camera off' : 'Turn camera on'} keys="Control+E Meta+E" off={!call.cam} onClick={() => void callMedia.toggleCam()}>
          {call.cam ? <Video /> : <VideoOff />}
        </Control>
      </div>
      {phone ? (
        <div className="call-controls-group">
          {add}
          <button ref={moreRef} type="button" className="call-control" onClick={() => setOpen((o) => !o)} aria-label="More call controls" aria-haspopup="true" aria-expanded={open}>
            <Ellipsis />
          </button>
          <Popover anchor={moreRef} open={open} onClose={() => setOpen(false)} width={260} align="end">
            <div className="call-menu">
              {[...tools, minimize].map((c) => (
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
        </div>
      ) : (
        <div className="call-controls-group">
          {tools.map((c) => (
            <Control key={c.label} label={c.label} keys={c.keys} on={'on' in c ? c.on : undefined} onClick={c.run}>
              {c.icon}
            </Control>
          ))}
          {add}
        </div>
      )}
      <div className="call-controls-group">
        {!phone && (
          <Control label={minimize.label} keys={minimize.keys} onClick={minimize.run}>
            {minimize.icon}
          </Control>
        )}
        <button type="button" className="call-leave" onClick={callSession.leave} aria-label="Leave the call" data-tip="Leave the call">
          <PhoneOff /> <span className="call-leave-word">Leave</span>
        </button>
      </div>
    </div>
  );
}
