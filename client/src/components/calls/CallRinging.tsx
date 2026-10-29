import type { ReactNode } from 'react';
import Avatar from '../ui/Avatar';
import AvatarStack from '../ui/AvatarStack';
import useStore from '../../state/useStore';
import type ActiveCall from '../../types/ActiveCall';

const names = (list: string[]) => (list.length <= 2 ? list.join(' and ') : `${list.slice(0, 2).join(', ')} and ${list.length - 2} more`);

// Before anyone else is in the call: who is being rung, large, or that you're the first one
// here, with your own picture in the corner, the way a phone shows an outgoing call.
export default function CallRinging({ call, self }: { call: ActiveCall; self: ReactNode }) {
  const users = useStore((s) => s.users);
  const projects = useStore((s) => s.projects);
  const ringing = call.view.ringing.map((id) => users[id]).filter(Boolean);
  const one = ringing.length === 1 ? ringing[0] : null;
  const project = call.view.projectId ? projects[call.view.projectId] : null;

  return (
    <div className="call-stage ringing">
      <div className="call-ringing" role="status">
        {one ? <Avatar user={one} size={120} /> : ringing.length ? <AvatarStack users={ringing} size={72} max={4} /> : null}
        <p className="call-ringing-title">{ringing.length ? names(ringing.map((u) => u.name)) : project ? `${project.name} call` : 'You’re the first one here'}</p>
        <p className="call-ringing-sub">{ringing.length ? <span className="call-ringing-dots">Ringing</span> : 'Others on the team can join from the project or the Calls page.'}</p>
      </div>
      <div className="call-self-corner">{self}</div>
    </div>
  );
}
