import { useState, type FormEvent } from 'react';
import { ArrowUpRight } from 'lucide-react';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import stealth from '../../actions/stealth';
import tokenAmount from '../../lib/tokenAmount';
import type StealthPayout from '../../types/StealthPayout';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export default function MovePayoutModal({ payout, onClose, onMoved }: { payout: StealthPayout; onClose: () => void; onMoved: () => void }) {
  const me = useStore((s) => s.me)!;
  const rewards = useStore((s) => s.rewards);
  const nox = useStore((s) => s.nox);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const token = rewards.find((t) => t.symbol === payout.token);
  const linksYou = ADDRESS.test(to) && to.toLowerCase() === me.address?.toLowerCase();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    try {
      const hashes = await stealth.move(payout, to.trim(), token.address);
      setSent(hashes);
      toast.show(hashes.length ? 'Sent. The funds arrive once the network includes it.' : 'Nothing to move from this address.', { tone: 'success' });
      onMoved();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Move ${payout.taskRef} payout`} onClose={onClose} width={520}>
      <form className="modal-body" style={{ display: 'grid', gap: 14 }} onSubmit={submit}>
        <p className="muted" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
          Sends {payout.balance ? tokenAmount(payout.balance.token, payout.token) : 'the tokens'} and any ETH left after gas from this one-time address. Your browser signs it with a key derived from your wallet; Nil only relays the signed transaction.
        </p>
        <input className="input mono" value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x… destination address" aria-label="Destination address" spellCheck={false} autoComplete="off" />
        {linksYou && <div className="plan-notice">That’s your sign-in wallet. Moving the payout there links it to you on-chain.</div>}
        {sent.length > 0 && nox && (
          <div className="settings-row">
            {sent.map((h) => (
              <a key={h} className="btn btn-sm btn-ghost" href={`${nox.explorer}/tx/${h}`} target="_blank" rel="noopener noreferrer">
                <ArrowUpRight /> {h.slice(0, 10)}…
              </a>
            ))}
          </div>
        )}
        <div className="settings-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>
            {sent.length ? 'Done' : 'Cancel'}
          </button>
          {!sent.length && (
            <button type="submit" className="btn btn-primary" disabled={busy || !ADDRESS.test(to.trim())}>
              {busy && <Spinner size={14} />} Move funds
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
