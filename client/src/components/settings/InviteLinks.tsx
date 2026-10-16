import { useCallback, useEffect, useState } from 'react';
import { Copy, Link2 } from 'lucide-react';
import Picker from '../ui/Picker';
import InviteRow from './InviteRow';
import toast from '../../state/toast';
import people from '../../actions/people';
import meta from '../../lib/meta';
import roleOptions from '../../lib/roleOptions';
import type Invite from '../../types/Invite';
import type Role from '../../types/Role';

const DAYS = [1, 7, 30].map((d) => ({ value: String(d), label: d === 1 ? 'Expires in 1 day' : `Expires in ${d} days` }));
const KINDS = [
  { value: 'single', label: 'Single-use link', hint: 'One person joins' },
  { value: 'reusable', label: 'Reusable link', hint: 'Anyone who has it joins' },
];
const MAX_USES = 1000;

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.show('Invite link copied. Send it to your teammate.', { tone: 'success' });
  } catch {
    toast.show('Couldn’t reach the clipboard. Select the link and copy it.', { tone: 'error' });
  }
}

// Making invite links and keeping track of them. Members (when allowed) make single-use links
// and see their own; admins can also make reusable ones and see who joined through each link.
export default function InviteLinks({ isAdmin, projectOptions }: { isAdmin: boolean; projectOptions: { value: string; label: string }[] }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [role, setRole] = useState<Role>('member');
  const [guestProjects, setGuestProjects] = useState<string[]>([]);
  const [reusable, setReusable] = useState(false);
  const [days, setDays] = useState('7');
  const [limit, setLimit] = useState('');
  const [link, setLink] = useState('');

  const refresh = useCallback(() => {
    people.invites().then(setInvites).catch(toast.error);
  }, []);
  useEffect(refresh, [refresh]);

  // reusable links never make admins, so picking one moves an admin invite down to member
  const pickKind = (kind: string) => {
    setReusable(kind === 'reusable');
    if (kind === 'reusable' && role === 'admin') setRole('member');
  };
  const roles = roleOptions.filter((o) => o.value !== 'owner' && (isAdmin || o.value !== 'admin') && !(reusable && o.value === 'admin'));
  const maxUses = limit.trim() ? Number(limit) : null;
  const limitOk = maxUses === null || (Number.isInteger(maxUses) && maxUses >= 2 && maxUses <= MAX_USES);

  const create = async () => {
    try {
      const { token } = await people.invite({ role, projectIds: role === 'guest' ? guestProjects : undefined, days: Number(days), ...(reusable ? { reusable: true, maxUses } : {}) });
      const url = `${location.origin}/invite/${token}`;
      setLink(url);
      refresh();
      copy(url);
    } catch (err) {
      toast.error(err);
    }
  };

  const revoke = (invite: Invite) => people.revokeInvite(invite.id).then(refresh).catch(toast.error);
  const active = invites.filter((i) => i.live);
  const past = invites.filter((i) => !i.live);

  return (
    <section className="settings-section">
      <h2>Invite people</h2>
      <p>
        {isAdmin
          ? 'A single-use link lets one person in. A reusable link lets anyone who has it join until it expires or reaches its limit, so share it only where you’d welcome everyone who can see it.'
          : 'Each invite link lets one person in. Send it privately; whoever opens it first joins with their wallet.'}{' '}
        Guests see only the projects you pick.
      </p>
      <div className="settings-card">
        <div className="settings-row">
          {isAdmin && (
            <Picker title="Kind of link" options={KINDS} value={reusable ? 'reusable' : 'single'} onChange={pickKind} className="btn" width={240}>
              {reusable ? 'Reusable link' : 'Single-use link'}
            </Picker>
          )}
          <Picker title="Role" options={roles} value={role} onChange={(v) => setRole(v as Role)} className="btn" width={240}>
            {meta.role[role]}
          </Picker>
          {role === 'guest' && (
            <Picker title="Projects they can see" multi options={projectOptions} value={guestProjects} onChange={(id) => setGuestProjects((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))} className="btn" width={260}>
              {guestProjects.length ? `${guestProjects.length} project${guestProjects.length === 1 ? '' : 's'}` : 'Pick projects'}
            </Picker>
          )}
          <Picker title="When it expires" options={DAYS} value={days} onChange={setDays} className="btn" width={200}>
            {DAYS.find((d) => d.value === days)?.label}
          </Picker>
          {reusable && (
            <label className="invite-limit">
              <span>Up to</span>
              <input className="input" type="number" inputMode="numeric" min={2} max={MAX_USES} placeholder="Any number" value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="Most people who can join with this link" aria-invalid={!limitOk} />
              <span>people</span>
            </label>
          )}
          <button type="button" className="btn btn-primary" onClick={create} disabled={(role === 'guest' && !guestProjects.length) || !limitOk}>
            <Link2 /> Create invite link
          </button>
        </div>
        {!limitOk && <small className="muted">A reusable link lets in between 2 and {MAX_USES} people. Leave it empty for no limit.</small>}
        {link && (
          <div className="invite-link">
            <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
            <button type="button" className="btn" onClick={() => copy(link)}>
              <Copy /> Copy
            </button>
          </div>
        )}
        {active.length > 0 && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Active links</div>
            {active.map((inv) => (
              <InviteRow key={inv.id} invite={inv} onRevoke={() => revoke(inv)} />
            ))}
          </div>
        )}
        {past.length > 0 && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Ended links</div>
            {past.map((inv) => (
              <InviteRow key={inv.id} invite={inv} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
