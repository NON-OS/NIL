import '../components/calls/Calls.css';
import { KeyRound, Lock, Phone, PhoneOff, Settings2 } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import EmptyState from '../components/ui/EmptyState';
import AvatarStack from '../components/ui/AvatarStack';
import CallPeopleList from '../components/calls/CallPeopleList';
import CallSettingsCard from '../components/calls/CallSettingsCard';
import CallPrefsCard from '../components/calls/CallPrefsCard';
import useStore from '../state/useStore';
import useCallStore from '../state/useCallStore';
import callStore from '../state/callStore';
import toast from '../state/toast';
import vault from '../actions/vault';
import callRuntime from '../actions/calls/callRuntime';
import callTitle from '../lib/calls/callTitle';
import isAdmin from '../lib/isAdmin';
import router from '../lib/router';

const WHY: Record<string, { title: string; text: string }> = {
  tor: { title: 'Calls don’t work over Tor', text: 'Tor carries only TCP, and a call needs UDP and a path between the browsers in it. Docs, tasks and everything else work as usual.' },
  off: { title: 'Calls are turned off', text: 'Whoever runs this server turned calls off.' },
  'no-relay': { title: 'Calls aren’t set up yet', text: 'Calls need a relay server (TURN) so nobody in a call learns anyone else’s IP address. Whoever runs this server can set one up; the guide is in the help, under Calls.' },
};

export default function CallsView() {
  const settings = useCallStore((s) => s.settings);
  const live = useCallStore((s) => s.live);
  const active = useCallStore((s) => s.active);
  const me = useStore((s) => s.me);
  const users = useStore((s) => s.users);
  const projects = useStore((s) => s.projects);
  const unlocked = useStore((s) => s.docsUnlocked);
  const hasPasskey = useStore((s) => s.passkeys.length > 0);
  const calls = Object.values(live).filter((c) => c.members.length > 0);
  const why = settings && !settings.available ? WHY[settings.reason ?? 'off'] : null;

  const join = (callId: string) => {
    if (active?.id === callId) return callRuntime.patch(() => ({ minimized: false }));
    callStore.set({ devices: { open: true, join: { callId, video: false } } });
  };

  return (
    <div className="main">
      <ViewHeader
        title="Calls"
        actions={
          settings?.available && (
            <button type="button" className="btn" onClick={() => callStore.set({ devices: { open: true, join: null } })}>
              <Settings2 /> Check your devices
            </button>
          )
        }
      />
      <div className="view-body calls-view">
        {why ? (
          <EmptyState icon={<PhoneOff />} title={why.title}>
            {why.text}
          </EmptyState>
        ) : (
          <>
            <p className="calls-intro">
              <Lock aria-hidden="true" /> Calls go straight from browser to browser, encrypted end to end and checked against the keys you confirmed with your teammates. Nothing is recorded, and no sound or picture passes through Nil’s server.{' '}
              <a href="/help/calls" onClick={router.link('/help/calls')}>
                How calls work
              </a>
            </p>
            {!unlocked && (
              <div className="settings-card calls-unlock">
                <p>Every call is checked with your encryption keys. Unlock them now, and answering a call takes one click.</p>
                <div className="settings-row">
                  <button type="button" className="btn btn-primary" onClick={() => vault.unlock({ passkey: hasPasskey }).catch(toast.error)}>
                    <KeyRound /> Unlock your keys
                  </button>
                </div>
              </div>
            )}
            {calls.length > 0 && (
              <section className="settings-section">
                <h2>Going on now</h2>
                <div className="settings-card">
                  <ul className="call-people">
                    {calls.map((c) => (
                      <li key={c.id} className="member">
                        <Phone aria-hidden="true" />
                        <div style={{ minWidth: 0 }}>
                          <div className="member-name">{callTitle(c, me?.id, users, projects)}</div>
                          <div className="member-sub">
                            {c.members.length} in the call{c.members.length >= (settings?.maxPeers ?? 6) ? ', which is full' : ''}
                          </div>
                        </div>
                        <div className="settings-row">
                          <AvatarStack users={c.members.map((m) => users[m.userId]).filter(Boolean)} />
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => join(c.id)} disabled={active !== null && active.id !== c.id}>
                            {active?.id === c.id ? 'Open' : 'Join'}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}
            <section className="settings-section">
              <h2>Call someone</h2>
              <div className="settings-card">
                <CallPeopleList busy={active !== null || !settings} />
              </div>
            </section>
            <CallPrefsCard />
            {isAdmin(me) && <CallSettingsCard />}
          </>
        )}
      </div>
    </div>
  );
}
