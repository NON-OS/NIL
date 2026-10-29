import '../components/calls/CallsPage.css';
import { useState } from 'react';
import { KeyRound, Lock, PhoneCall, Settings2 } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import Spinner from '../components/ui/Spinner';
import CallPeopleList from '../components/calls/CallPeopleList';
import CallRecents from '../components/calls/CallRecents';
import CallsLive from '../components/calls/CallsLive';
import CallsNotReady from '../components/calls/CallsNotReady';
import NewCallDialog from '../components/calls/NewCallDialog';
import CallSettingsCard from '../components/calls/CallSettingsCard';
import CallPrefsCard from '../components/calls/CallPrefsCard';
import useStore from '../state/useStore';
import useCallStore from '../state/useCallStore';
import callStore from '../state/callStore';
import toast from '../state/toast';
import vault from '../actions/vault';
import isAdmin from '../lib/isAdmin';
import router from '../lib/router';

// Calls: what's going on now, the team to call, this browser's recent calls, and how this
// person takes calls. Calls themselves happen over the app (CallLayer), wherever you are.
export default function CallsView() {
  const settings = useCallStore((s) => s.settings);
  const active = useCallStore((s) => s.active);
  const me = useStore((s) => s.me);
  const unlocked = useStore((s) => s.docsUnlocked);
  const hasPasskey = useStore((s) => s.passkeys.length > 0);
  const [picking, setPicking] = useState(false);
  const busy = active !== null || !settings;
  const ready = settings?.available;

  return (
    <div className="main">
      <ViewHeader
        title="Calls"
        actions={
          ready && (
            <>
              <button type="button" className="btn" onClick={() => callStore.set({ devices: { open: true, join: null } })} aria-label="Check your devices">
                <Settings2 /> <span className="calls-wide">Check your devices</span>
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setPicking(true)} disabled={busy}>
                <PhoneCall /> New call
              </button>
            </>
          )
        }
      />
      <div className="page calls-page">
        {!settings ? (
          <div className="calls-loading" role="status">
            <Spinner size={18} /> Loading calls…
          </div>
        ) : !ready ? (
          <CallsNotReady reason={settings.reason ?? 'off'} admin={isAdmin(me)} />
        ) : (
          <>
            {!unlocked && (
              <div className="calls-unlock">
                <KeyRound aria-hidden="true" />
                <p>Every call is checked against your encryption keys. Unlock them now, and answering takes one tap.</p>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => vault.unlock({ passkey: hasPasskey }).catch(toast.error)}>
                  Unlock your keys
                </button>
              </div>
            )}
            <CallsLive />
            <div className="calls-grid">
              <section className="panel">
                <div className="panel-head">
                  <h2>People</h2>
                </div>
                <div className="panel-body calls-panel-body">
                  <CallPeopleList busy={busy} />
                </div>
              </section>
              <div className="calls-side">
                <section className="panel">
                  <div className="panel-head">
                    <h2>Recent</h2>
                  </div>
                  <div className="panel-body calls-panel-body">
                    <CallRecents busy={busy} />
                  </div>
                </section>
                <CallPrefsCard />
                {isAdmin(me) && <CallSettingsCard />}
              </div>
            </div>
            <p className="calls-foot">
              <Lock aria-hidden="true" /> Every call is encrypted end to end and checked against the keys you confirmed with your teammates. Nothing is recorded.{' '}
              <a href="/help/calls" onClick={router.link('/help/calls')}>
                How calls stay private
              </a>
            </p>
          </>
        )}
      </div>
      {picking && <NewCallDialog onClose={() => setPicking(false)} />}
    </div>
  );
}
