import { useEffect, useState } from 'react';
import Avatar from '../ui/Avatar';
import useStore from '../../state/useStore';
import useCallStore from '../../state/useCallStore';
import toast from '../../state/toast';
import callApi, { type CallBlocks } from '../../actions/calls/callApi';
import iceConfig from '../../actions/calls/iceConfig';

// This person's own call choices: whether they take calls at all, who may not ring them, and,
// where an admin allows it, whether this device may connect directly.
export default function CallPrefsCard() {
  const users = useStore((s) => s.users);
  const directAllowed = useCallStore((s) => s.settings?.direct ?? false);
  const [blocks, setBlocks] = useState<CallBlocks | null>(null);
  const [direct, setDirect] = useState(iceConfig.directHere);

  useEffect(() => {
    callApi.blocks().then(setBlocks, toast.error);
  }, []);

  const change = (body: Parameters<typeof callApi.setBlocks>[0]) => callApi.setBlocks(body).then(setBlocks, toast.error);
  const flipDirect = () => {
    iceConfig.setDirectHere(!direct);
    setDirect(!direct);
  };

  if (!blocks) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Taking calls</h2>
      </div>
      <div className="panel-body calls-settings">
        <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
          <span>
            <strong>Don’t ring me</strong>
            <br />
            <span className="muted">Nobody can ring you, in Nil or on your phone. Calls you’re asked into still show on this page, to join if you want.</span>
          </span>
          <button type="button" className="toggle" role="switch" aria-checked={blocks.dnd} onClick={() => void change({ dnd: !blocks.dnd })} aria-label="Don’t ring me" />
        </label>
        {blocks.blocked.length > 0 && (
          <ul className="call-people" aria-label="People who can’t ring you">
            {blocks.blocked.map((id) => (
              <li key={id} className="call-person">
                <Avatar user={users[id]} size={32} />
                <div className="call-person-text">
                  <span className="call-person-name">{users[id]?.name ?? 'Someone who left'}</span>
                  <span className="call-person-sub">Can’t ring you</span>
                </div>
                <button type="button" className="btn btn-sm" onClick={() => void change({ unblock: id })}>
                  Let them ring me
                </button>
              </li>
            ))}
          </ul>
        )}
        {directAllowed && (
          <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
            <span>
              <strong>Direct connections on this device</strong>
              <br />
              <span className="muted">Your admin allows calls to skip the relay. Turn this on and calls from this device may connect directly when they can, and the people in them see this device’s IP address.</span>
            </span>
            <button type="button" className="toggle" role="switch" aria-checked={direct} onClick={flipDirect} aria-label="Direct connections on this device" />
          </label>
        )}
      </div>
    </section>
  );
}
