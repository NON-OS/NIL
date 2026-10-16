import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Link2, Trash2 } from 'lucide-react';
import Avatar from '../ui/Avatar';
import Picker from '../ui/Picker';
import ConfirmButton from '../ui/ConfirmButton';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import people from '../../actions/people';
import meta from '../../lib/meta';
import dates from '../../lib/dates';
import type Invite from '../../types/Invite';
import type Role from '../../types/Role';
import HolderGateCard from './HolderGateCard';
import '../bounty/Bounty.css';
import isAdminUser from '../../lib/isAdmin';
import GuestProjects from './GuestProjects';
import VotePowerCard from './VotePowerCard';
import WalletAddress from './WalletAddress';
import useCryptoTools from '../../hooks/useCryptoTools';

const HINT: Record<Role, string> = { guest: 'Sees only chosen projects', member: 'Works on tasks', admin: 'Manages people', owner: 'Full control' };
const ROLE_OPTIONS = (['guest', 'member', 'admin', 'owner'] as Role[]).map((r) => ({ value: r, label: meta.role[r], hint: HINT[r] }));

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.show('Invite link copied. Send it to your teammate.', { tone: 'success' });
  } catch {
    toast.show('Couldn’t reach the clipboard. Select the link and copy it.', { tone: 'error' });
  }
}

export default function TeamSettings() {
  const me = useStore((s) => s.me)!;
  const userMap = useStore((s) => s.users);
  const isAdmin = isAdminUser(me);
  const cryptoTools = useCryptoTools();
  const sharing = useStore((s) => s.sharing);
  const isGuest = useStore((s) => s.guest);
  const projectMap = useStore((s) => s.projects);
  const projectOptions = useMemo(() => Object.values(projectMap).filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.name })), [projectMap]);
  const canInvite = isAdmin || (!isGuest && sharing.invitePolicy === 'members');
  const [guestProjects, setGuestProjects] = useState<string[]>([]);
  const users = useMemo(() => Object.values(userMap).sort((a, b) => Number(a.deactivated) - Number(b.deactivated) || a.name.localeCompare(b.name)), [userMap]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [role, setRole] = useState<Role>('member');
  const [link, setLink] = useState('');

  const refresh = useCallback(() => {
    if (canInvite) people.invites().then(setInvites).catch(toast.error);
  }, [canInvite]);
  useEffect(refresh, [refresh]);

  const createInvite = async () => {
    try {
      const { token } = await people.invite({ role, projectIds: role === 'guest' ? guestProjects : undefined });
      const url = `${location.origin}/invite/${token}`;
      setLink(url);
      refresh();
      copy(url);
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <>
      {canInvite && (
        <section className="settings-section">
          <h2>Invite people</h2>
          <p>Invite links work once and expire after 7 days. Send one privately; whoever opens it first joins with their wallet. Guests see only the projects you pick.</p>
          <div className="settings-card">
            <div className="settings-row">
              <Picker title="Role" options={ROLE_OPTIONS.filter((o) => o.value !== 'owner' && (isAdmin || o.value !== 'admin'))} value={role} onChange={(v) => setRole(v as Role)} className="btn" width={240}>
                {meta.role[role]}
              </Picker>
              {role === 'guest' && (
                <Picker title="Projects they can see" multi options={projectOptions} value={guestProjects} onChange={(id) => setGuestProjects((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))} className="btn" width={260}>
                  {guestProjects.length ? `${guestProjects.length} project${guestProjects.length === 1 ? '' : 's'}` : 'Pick projects'}
                </Picker>
              )}
              <button type="button" className="btn btn-primary" onClick={createInvite} disabled={role === 'guest' && !guestProjects.length}>
                <Link2 /> Create invite link
              </button>
            </div>
            {link && (
              <div className="invite-link">
                <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Invite link" />
                <button type="button" className="btn" onClick={() => copy(link)}>
                  <Copy /> Copy
                </button>
              </div>
            )}
            {invites.length > 0 && (
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Pending invites</div>
                {invites.map((inv) => (
                  <div key={inv.id} className="member">
                    <Avatar user={null} size={28} />
                    <div>
                      <div className="member-name">Single-use link</div>
                      <div className="member-sub">
                        {meta.role[inv.role]} · expires {dates.short(dates.toISO(new Date(inv.expiresAt)))}
                      </div>
                    </div>
                    <div className="member-actions">
                      <button type="button" className="btn btn-sm" onClick={() => people.revokeInvite(inv.id).then(refresh).catch(toast.error)}>
                        <Trash2 /> Revoke
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {isAdmin && (
        <section className="settings-section">
          <h2>Sharing</h2>
          <div className="settings-card">
            <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
              <span>
                <strong>Members can invite people</strong>
                <br />
                <span className="muted">Members can create invite links for members and guests. Only admins can invite admins.</span>
              </span>
              <button type="button" className="toggle" role="switch" aria-checked={sharing.invitePolicy === 'members'} onClick={() => people.setSharing({ invitePolicy: sharing.invitePolicy === 'members' ? 'admins' : 'members' })} aria-label="Members can invite people" />
            </label>
            <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
              <span>
                <strong>Allow read-only share links</strong>
                <br />
                <span className="muted">Secret links that show a project or task to people outside the workspace, without signing in. Turning this off disables every existing link at once.</span>
              </span>
              <button type="button" className="toggle" role="switch" aria-checked={sharing.shareLinks} onClick={() => people.setSharing({ shareLinks: !sharing.shareLinks })} aria-label="Allow read-only share links" />
            </label>
          </div>
        </section>
      )}

      {isAdmin && cryptoTools && (
        <section className="settings-section">
          <h2>Token holders</h2>
          <HolderGateCard />
        </section>
      )}

      {isAdmin && cryptoTools && (
        <section className="settings-section">
          <h2>Voting power</h2>
          <VotePowerCard />
        </section>
      )}

      <section className="settings-section">
        <h2>Members</h2>
        <div className="settings-card" style={{ paddingBlock: 6 }}>
          {users.map((u) => (
            <div key={u.id} className={`member${u.deactivated ? ' off' : ''}`}>
              <Avatar user={u} size={32} />
              <div style={{ minWidth: 0 }}>
                <div className="member-name">
                  {u.name} {u.id === me.id && <span className="muted">(you)</span>}
                </div>
                <div className="member-sub">
                  {[u.deactivated ? 'Access removed' : meta.role[u.role], cryptoTools && u.joinedVia === 'holder' && 'joined as holder', u.title].filter(Boolean).join(' · ')}
                  {u.address && (
                    <>
                      {' · '}
                      <WalletAddress address={u.address} />
                    </>
                  )}
                </div>
              </div>
              {isAdmin && u.id !== me.id && (u.role !== 'owner' || me.role === 'owner') && (
                <div className="member-actions">
                  {!u.deactivated && (
                    <Picker title="Change role" options={me.role === 'owner' ? ROLE_OPTIONS : ROLE_OPTIONS.filter((o) => o.value !== 'owner')} value={u.role} onChange={(v) => people.update(u.id, { role: v as Role })} className="btn btn-sm" width={220} align="end">
                      {meta.role[u.role]}
                    </Picker>
                  )}
                  {u.role === 'guest' && !u.deactivated && (
                    <GuestProjects user={u} options={projectOptions} />
                  )}
                  {cryptoTools && u.joinedVia === 'holder' && !u.deactivated && (
                    <button type="button" className="btn btn-sm" onClick={() => people.update(u.id, { keepWithoutNox: true })} title="Stops checking their balance at sign-in">
                      Keep without NOX
                    </button>
                  )}
                  {u.deactivated ? (
                    <>
                      <button type="button" className="btn btn-sm" onClick={() => people.update(u.id, { deactivated: false })}>
                        Restore access
                      </button>
                      <ConfirmButton className="btn btn-sm btn-danger" onConfirm={() => people.erase(u.id)} confirmLabel="Delete forever?">
                        Delete account
                      </ConfirmButton>
                    </>
                  ) : (
                    <ConfirmButton className="btn btn-sm btn-danger" onConfirm={() => people.update(u.id, { deactivated: true })} confirmLabel="Click to confirm">
                      Remove access
                    </ConfirmButton>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
