import { ShieldQuestion } from 'lucide-react';
import useStore from '../../state/useStore';
import callSession from '../../actions/calls/callSession';
import confirmKeys from '../../actions/confirmKeys';
import type ActiveCall from '../../types/ActiveCall';

const list = (names: string[]) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

// The people this browser sends nothing to until their key is confirmed, said once above the
// call rather than over their faces, with the two ways forward: check their keys, or talk to
// them for this call anyway.
export default function CallHeldBar({ call }: { call: ActiveCall }) {
  const users = useStore((s) => s.users);
  const held = Object.values(call.peers).filter((p) => p.held && p.link !== 'refused');
  if (!held.length) return null;
  const names = held.map((p) => users[p.userId]?.name ?? 'Someone');
  const checkable = held.filter((p) => p.trust !== 'none').map((p) => p.userId);

  return (
    <div className="call-held" role="status">
      <ShieldQuestion aria-hidden="true" />
      <p>
        <strong>{list(names)} can’t see or hear you yet.</strong> {held.length === 1 ? 'You haven’t confirmed their key.' : 'You haven’t confirmed their keys.'} Check {held.length === 1 ? 'it' : 'them'}, or talk anyway for this call.
      </p>
      <div className="call-held-actions">
        {checkable.length > 0 && (
          <button type="button" className="btn btn-sm call-btn-quiet" onClick={() => confirmKeys.show(checkable, 'this call')}>
            Check {held.length === 1 ? 'their keys' : 'keys'}
          </button>
        )}
        {held.map((p) => (
          <button key={p.userId} type="button" className="btn btn-sm call-btn-light" onClick={() => callSession.allow(p.userId)} aria-label={held.length === 1 ? 'Talk anyway' : `Talk anyway with ${users[p.userId]?.name ?? 'them'}`}>
            {held.length === 1 ? 'Talk anyway' : `Talk to ${users[p.userId]?.name ?? 'them'}`}
          </button>
        ))}
      </div>
    </div>
  );
}
