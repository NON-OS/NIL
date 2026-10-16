import { Link2, Repeat, Trash2 } from 'lucide-react';
import useStore from '../../state/useStore';
import meta from '../../lib/meta';
import dates from '../../lib/dates';
import type Invite from '../../types/Invite';

const day = (ms: number) => dates.short(dates.toISO(new Date(ms)));

function usage(invite: Invite) {
  if (!invite.reusable) return invite.uses ? 'used' : 'not used yet';
  if (invite.maxUses) return `${invite.uses} of ${invite.maxUses} used`;
  return invite.uses ? `${invite.uses} joined` : 'nobody yet';
}

function status(invite: Invite) {
  if (invite.revokedAt) return `revoked ${day(invite.revokedAt)}`;
  if (invite.live) return `expires ${day(invite.expiresAt)}`;
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return invite.reusable ? 'used up' : null;
  return `expired ${day(invite.expiresAt)}`;
}

// One invite link: what kind, how far it has been used, and (for admins) who came in with it.
export default function InviteRow({ invite, onRevoke }: { invite: Invite; onRevoke?: () => void }) {
  const users = useStore((s) => s.users);
  const joined = invite.joined.map((j) => users[j.userId]?.name ?? 'someone who has left');

  return (
    <div className="member">
      <span className="invite-kind" aria-hidden="true">
        {invite.reusable ? <Repeat size={16} /> : <Link2 size={16} />}
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="member-name">{invite.reusable ? 'Reusable link' : 'Single-use link'}</div>
        <div className="member-sub">{[meta.role[invite.role], usage(invite), status(invite)].filter(Boolean).join(' · ')}</div>
        {joined.length > 0 && <div className="member-sub invite-joined">Joined: {joined.join(', ')}</div>}
      </div>
      <div className="member-actions">
        {invite.live && onRevoke && (
          <button type="button" className="btn btn-sm" onClick={onRevoke}>
            <Trash2 /> Revoke
          </button>
        )}
      </div>
    </div>
  );
}
