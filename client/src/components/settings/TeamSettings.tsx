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
import shortAddress from '../../lib/shortAddress';
import HolderGateCard from './HolderGateCard';
import '../bounty/Bounty.css';

const ROLE_OPTIONS = (['member', 'admin', 'owner'] as Role[]).map((r) => ({ value: r, label: meta.role[r], hint: r === 'member' ? 'Works on tasks' : r === 'admin' ? 'Manages people' : 'Full control' }));

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
  const isAdmin = me.role !== 'member';
  const users = useMemo(() => Object.values(userMap).sort((a, b) => Number(a.deactivated) - Number(b.deactivated) || a.name.localeCompare(b.name)), [userMap]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [role, setRole] = useState<Role>('member');
  const [link, setLink] = useState('');

  const refresh = useCallback(() => {
    if (isAdmin) people.invites().then(setInvites).catch(toast.error);
  }, [isAdmin]);
  useEffect(refresh, [refresh]);

  const createInvite = async () => {
    try {
      const { token } = await people.invite({ role });
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
      {isAdmin && (
        <section className="settings-section">
          <h2>Invite people</h2>
          <p>Invite links work once and expire after 7 days. Send one privately; whoever opens it first joins with their wallet.</p>
          <div className="settings-card">
            <div className="settings-row">
              <Picker title="Role" options={ROLE_OPTIONS.filter((o) => o.value !== 'owner')} value={role} onChange={(v) => setRole(v as Role)} className="btn" width={220}>
                {meta.role[role]}
              </Picker>
              <button type="button" className="btn btn-primary" onClick={createInvite}>
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
          <h2>Token holders</h2>
          <HolderGateCard />
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
                  {[u.deactivated ? 'Access removed' : meta.role[u.role], u.joinedVia === 'holder' && 'joined as holder', u.title, u.address && shortAddress(u.address)].filter(Boolean).join(' · ')}
                </div>
              </div>
              {isAdmin && u.id !== me.id && (u.role !== 'owner' || me.role === 'owner') && (
                <div className="member-actions">
                  {!u.deactivated && (
                    <Picker title="Change role" options={me.role === 'owner' ? ROLE_OPTIONS : ROLE_OPTIONS.filter((o) => o.value !== 'owner')} value={u.role} onChange={(v) => people.update(u.id, { role: v as Role })} className="btn btn-sm" width={220} align="end">
                      {meta.role[u.role]}
                    </Picker>
                  )}
                  {u.joinedVia === 'holder' && !u.deactivated && (
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
