import { useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft, ExternalLink, KeyRound } from 'lucide-react';
import MovePayoutModal from './MovePayoutModal';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import stealth from '../../actions/stealth';
import tokenAmount from '../../lib/tokenAmount';
import shortAddress from '../../lib/shortAddress';
import dates from '../../lib/dates';
import type StealthPayout from '../../types/StealthPayout';

// Bounties paid to you privately. Each sits on its own one-time address until you move it.
export default function StealthPayouts({ revision }: { revision: unknown }) {
  const nox = useStore((s) => s.nox);
  const [list, setList] = useState<StealthPayout[]>([]);
  const [moving, setMoving] = useState<StealthPayout | null>(null);
  const [shown, setShown] = useState<{ id: string; key: string } | null>(null);

  const refresh = useCallback(() => stealth.payouts().then(setList).catch(toast.error), []);
  useEffect(() => {
    refresh();
  }, [refresh, revision]);

  const reveal = async (p: StealthPayout) => {
    try {
      setShown({ id: p.id, key: await stealth.exportKey(p) });
    } catch (err) {
      toast.error(err);
    }
  };

  if (!list.length) return null;
  return (
    <section className="settings-section">
      <h2>Your private payouts</h2>
      <p>Each one sits on its own one-time address that only your wallet’s keys open. Move it wherever you like, or export the key into any wallet.</p>
      <div className="settings-card bounty-list" style={{ padding: 0 }}>
        {list.map((p) => (
          <div key={p.id} className="bounty-item" style={{ cursor: 'default' }}>
            <div style={{ minWidth: 0 }}>
              <div className="bounty-item-title">
                <span className="mono muted">{p.taskRef}</span>
                <span>{tokenAmount(p.amount, p.token)}</span>
              </div>
              <div className="bounty-item-sub">
                <span className="mono">{shortAddress(p.address)}</span> · {dates.ago(p.createdAt)} · {p.balance && p.balanceCheckedAt ? `held ${tokenAmount(p.balance.token, p.token, 2)} ${dates.ago(p.balanceCheckedAt)}` : 'balance not read yet'}
                {!p.announced && ' · not announced yet'}
              </div>
              {shown?.id === p.id && (
                <div className="key-once" style={{ marginTop: 8 }}>
                  <code>{shown.key}</code>
                  <span className="muted">Anyone with this key controls the payout. Import it into a wallet you trust, then close this.</span>
                </div>
              )}
            </div>
            <span className={`pay-status ${p.status}`}>{p.status === 'confirmed' ? 'Received' : 'Confirming'}</span>
            <div className="bounty-actions">
              {nox && (
                <a className="btn btn-sm btn-ghost" href={`${nox.explorer}/address/${p.address}`} target="_blank" rel="noopener noreferrer" title="Opens a block explorer in a new tab">
                  <ExternalLink />
                </a>
              )}
              <button type="button" className="btn btn-sm" onClick={() => (shown?.id === p.id ? setShown(null) : reveal(p))}>
                <KeyRound /> {shown?.id === p.id ? 'Hide key' : 'Key'}
              </button>
              <button type="button" className="btn btn-sm btn-primary" disabled={p.status !== 'confirmed'} onClick={() => setMoving(p)}>
                <ArrowRightLeft /> Move
              </button>
            </div>
          </div>
        ))}
      </div>
      {moving && <MovePayoutModal payout={moving} onClose={() => setMoving(null)} onMoved={refresh} />}
    </section>
  );
}
