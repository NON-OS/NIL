import { useMemo } from 'react';
import Avatar from '../ui/Avatar';
import Picker from '../ui/Picker';
import ConfirmButton from '../ui/ConfirmButton';
import useStore from '../../state/useStore';
import people from '../../actions/people';
import meta from '../../lib/meta';
import roleOptions from '../../lib/roleOptions';
import type Role from '../../types/Role';
import HolderGateCard from './HolderGateCard';
import '../bounty/Bounty.css';
import isAdminUser from '../../lib/isAdmin';
import GuestProjects from './GuestProjects';
import VotePowerCard from './VotePowerCard';
import WalletAddress from './WalletAddress';
import InviteLinks from './InviteLinks';
import useCryptoTools from '../../hooks/useCryptoTools';
import ResetSignInButton from './ResetSignInButton';
import SignInResetsCard from './SignInResetsCard';

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
  const users = useMemo(() => Object.values(userMap).sort((a, b) => Number(a.deactivated) - Number(b.deactivated) || a.name.localeCompare(b.name)), [userMap]);

  return (
    <>
      {canInvite && <InviteLinks isAdmin={isAdmin} projectOptions={projectOptions} />}

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
                    <Picker title="Change role" options={me.role === 'owner' ? roleOptions : roleOptions.filter((o) => o.value !== 'owner')} value={u.role} onChange={(v) => people.update(u.id, { role: v as Role })} className="btn btn-sm" width={220} align="end">
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
                  {!u.deactivated && <ResetSignInButton user={u} />}
                </div>
              )}
              {/* admins can't otherwise manage an owner, but can ask to reset their sign-in */}
              {isAdmin && me.role !== 'owner' && u.role === 'owner' && !u.deactivated && (
                <div className="member-actions">
                  <ResetSignInButton user={u} />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {isAdmin && <SignInResetsCard />}
    </>
  );
}
