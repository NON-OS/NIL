import { KeyRound, Phone, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Video } from 'lucide-react';
import AvatarStack from '../ui/AvatarStack';
import ConfirmButton from '../ui/ConfirmButton';
import useStore from '../../state/useStore';
import useCallStore from '../../state/useCallStore';
import toast from '../../state/toast';
import vault from '../../actions/vault';
import startCall from '../../actions/calls/startCall';
import callHistory, { type CallRecord } from '../../actions/calls/callHistory';
import useCallHistory from '../../hooks/useCallHistory';
import callWhen from '../../lib/calls/callWhen';
import cx from '../../lib/cx';

const WAY = {
  out: { icon: PhoneOutgoing, word: 'Outgoing' },
  in: { icon: PhoneIncoming, word: 'Incoming' },
  missed: { icon: PhoneMissed, word: 'Missed' },
  declined: { icon: PhoneOff, word: 'Declined' },
};

// The calls this person made, took and missed, kept encrypted in this browser only, with a way
// to call back. The server keeps no history of calls, so another device has its own.
export default function CallRecents({ busy }: { busy: boolean }) {
  const list = useCallHistory();
  const users = useStore((s) => s.users);
  const projects = useStore((s) => s.projects);
  const me = useStore((s) => s.me?.id);
  const hasPasskey = useStore((s) => s.passkeys.length > 0);
  const live = useCallStore((s) => s.live);

  if (list === null) {
    return (
      <div className="call-panel-empty">
        <p>Your recent calls are kept encrypted in this browser. Unlock your keys to see them.</p>
        <button type="button" className="btn btn-sm" onClick={() => vault.unlock({ passkey: hasPasskey }).catch(toast.error)}>
          <KeyRound /> Unlock
        </button>
      </div>
    );
  }
  if (!list.length) return <p className="call-panel-empty">Calls you make, take and miss show here. They’re kept only in this browser, encrypted, and never on the server.</p>;

  const name = (r: CallRecord) => {
    if (r.kind === 'project') return `${projects[r.projectId ?? '']?.name ?? 'Project'} call`;
    const names = r.people.map((id) => users[id]?.name ?? 'Someone who left');
    return names.length ? (names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ')) : 'Call';
  };
  const callBack = (r: CallRecord, video: boolean) => {
    if (r.kind === 'project' && r.projectId) return void startCall({ projectId: r.projectId }, { video });
    const people = r.people.filter((id) => users[id] && !users[id].deactivated && id !== me);
    if (people.length) void startCall({ with: people }, { video });
  };

  return (
    <>
      <ul className="call-recents">
        {list.slice(0, 20).map((r) => {
          const way = WAY[r.way];
          const Icon = way.icon;
          const going = live[r.id]?.members.length;
          return (
            <li key={`${r.id}:${r.way}`} className={cx('call-recent', r.way === 'missed' && 'missed')}>
              <AvatarStack users={r.people.map((id) => users[id]).filter(Boolean)} size={28} max={2} />
              <div className="call-person-text">
                <span className="call-person-name">{name(r)}</span>
                <span className="call-person-sub">
                  <Icon aria-hidden="true" /> {way.word}
                  {r.video ? ' video' : ''} · {callWhen.at(r.at)}
                  {r.seconds > 0 && ` · ${callWhen.lasted(r.seconds)}`}
                  {going ? ' · going on now' : ''}
                </span>
              </div>
              <button type="button" className="icon-btn call-person-btn" disabled={busy} onClick={() => callBack(r, false)} aria-label={`Call back: ${name(r)}`} title="Call back">
                <Phone />
              </button>
              <button type="button" className="icon-btn call-person-btn" disabled={busy} onClick={() => callBack(r, true)} aria-label={`Video call back: ${name(r)}`} title="Video call back">
                <Video />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="call-panel-foot">
        <ConfirmButton className="btn btn-sm btn-ghost" confirmLabel="Clear them" onConfirm={() => void callHistory.clear()}>
          Clear recent calls
        </ConfirmButton>
      </div>
    </>
  );
}
