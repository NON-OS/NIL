import './SignInResets.css';
import { useCallback, useEffect, useState } from 'react';
import Avatar from '../ui/Avatar';
import ResetLinkModal from './ResetLinkModal';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import signInResets from '../../actions/signInResets';
import describeSignInEvent from '../../lib/describeSignInEvent';
import dates from '../../lib/dates';
import timeLeft from '../../lib/timeLeft';
import type SignInReset from '../../types/SignInReset';
import type SignInAuditEntry from '../../types/SignInAuditEntry';

// Open sign-in resets, the approvals they wait for, and the sign-in log. Admins only.
export default function SignInResetsCard() {
  const me = useStore((s) => s.me)!;
  const users = useStore((s) => s.users);
  const [data, setData] = useState<{ resets: SignInReset[]; log: SignInAuditEntry[] } | null>(null);
  const [link, setLink] = useState<{ name: string; url: string; expiresAt: number } | null>(null);

  const refresh = useCallback(() => {
    signInResets.overview().then(setData).catch(toast.error);
  }, []);
  useEffect(() => {
    refresh();
    return signInResets.onChange(refresh);
  }, [refresh]);

  const nameOf = (id: string | null) => (id && users[id]?.name) || 'A deleted account';
  const ready = (r: SignInReset) => r.readyAt !== null && r.readyAt <= Date.now();
  const who = (r: SignInReset) => {
    if (r.awaitingApproval) return `Asked by ${nameOf(r.requestedBy)}, waiting for a second admin`;
    if (r.readyAt !== null) return ready(r) ? `Asked by ${nameOf(r.requestedBy)}, who can make the link now` : `Asked by ${nameOf(r.requestedBy)}, nobody could approve, link from ${dates.dateTime(r.readyAt)}`;
    return r.approvedBy ? `Asked by ${nameOf(r.requestedBy)}, approved by ${nameOf(r.approvedBy)}` : `Link made by ${nameOf(r.requestedBy)}`;
  };

  const show = async (r: SignInReset, get: (id: string) => Promise<{ reset: SignInReset; token: string }>) => {
    try {
      const { reset, token } = await get(r.id);
      setLink({ name: nameOf(r.userId), url: signInResets.link(token), expiresAt: reset.expiresAt });
    } catch (err) {
      toast.error(err);
    }
  };

  if (!data) return null;

  return (
    <section className="settings-section">
      <h2>Sign-in resets</h2>
      <p>For someone who lost every wallet. Reset sign-in on their row makes a link that works once and lets them link a new wallet to the same account. Resetting an owner needs a second admin to approve. When there’s nobody to approve, it waits a few days first, and anyone here can cancel it meanwhile.</p>
      <div className="settings-card" style={{ paddingBlock: 6 }}>
        {!data.resets.length && <p className="muted reset-empty">No resets waiting.</p>}
        {data.resets.map((r) => (
          <div key={r.id} className="member">
            <Avatar user={users[r.userId] ?? null} size={32} />
            <div style={{ minWidth: 0 }}>
              <div className="member-name">{nameOf(r.userId)}</div>
              <div className="member-sub">
                {who(r)}
                {r.readyAt !== null && !ready(r) ? '' : ` · ${timeLeft(r.expiresAt)}`}
              </div>
            </div>
            <div className="member-actions">
              {r.awaitingApproval && r.requestedBy !== me.id && r.userId !== me.id && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => show(r, signInResets.approve)}>
                  Approve
                </button>
              )}
              {ready(r) && r.requestedBy === me.id && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => show(r, signInResets.makeLink)}>
                  Make the link
                </button>
              )}
              <button type="button" className="btn btn-sm" onClick={() => signInResets.cancel(r.id).catch(toast.error)}>
                Cancel
              </button>
            </div>
          </div>
        ))}
      </div>
      {data.log.length > 0 && (
        <details className="reset-log">
          <summary>Sign-in history</summary>
          <ol>
            {data.log.map((e) => (
              <li key={e.id}>
                <span>{describeSignInEvent(e, nameOf)}</span>
                <time dateTime={new Date(e.createdAt).toISOString()} title={dates.dateTime(e.createdAt)}>
                  {dates.ago(e.createdAt)}
                </time>
              </li>
            ))}
          </ol>
        </details>
      )}
      {link && <ResetLinkModal name={link.name} url={link.url} expiresAt={link.expiresAt} onClose={() => setLink(null)} />}
    </section>
  );
}
