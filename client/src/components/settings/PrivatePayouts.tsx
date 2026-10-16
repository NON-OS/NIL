import { useState } from 'react';
import { EyeOff } from 'lucide-react';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import stealth from '../../actions/stealth';
import HelpLink from '../help/HelpLink';

// Opt-in: bounties paid to you land on a fresh one-time address every time, instead of the
// wallet that signs you in, so nobody watching the chain can add up what you earn.
export default function PrivatePayouts() {
  const on = useStore((s) => Boolean(s.me?.stealthMeta));
  const chain = useStore((s) => Boolean(s.stealth));
  const [busy, setBusy] = useState(false);
  if (!chain) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (on) await stealth.disable();
      else await stealth.enable();
      toast.show(on ? 'Private payouts off. New bounties go to your sign-in wallet.' : 'Private payouts on. Each bounty now lands on its own one-time address.', { tone: 'success' });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section">
      <h2>
        Private payouts <HelpLink topic="private-payouts" label="How private payouts work" />
      </h2>
      <div className="settings-card">
        <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
          <span>
            <strong>
              <EyeOff size={14} style={{ verticalAlign: '-2px' }} /> Receive bounties at one-time addresses
            </strong>
            <br />
            <span className="muted">
              Each payout goes to a fresh address only your wallet can open (ERC-5564 stealth addresses), so your earnings can’t be traced to your sign-in wallet or added up. Your keys come from a wallet signature and stay in this browser. The payer and the amount are still visible on-chain.
            </span>
          </span>
          {busy ? <Spinner size={16} /> : <button type="button" className="toggle" role="switch" aria-checked={on} onClick={toggle} aria-label="Receive bounties at one-time addresses" />}
        </label>
      </div>
    </section>
  );
}
