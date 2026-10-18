import { useState } from 'react';
import { EyeOff } from 'lucide-react';
import Spinner from '../ui/Spinner';
import StealthRegistry from './StealthRegistry';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import stealth from '../../actions/stealth';
import HelpLink from '../help/HelpLink';
import type RegistryEntry from '../../types/RegistryEntry';

// Opt-in: bounties paid to you land on a fresh one-time address every time, instead of the
// wallet that signs you in, so nobody watching the chain can add up what you earn.
export default function PrivatePayouts() {
  const meta = useStore((s) => s.me?.stealthMeta ?? null);
  const chain = useStore((s) => Boolean(s.stealth));
  const [busy, setBusy] = useState(false);
  const [registered, setRegistered] = useState<RegistryEntry | null>(null);
  if (!chain) return null;
  const on = Boolean(meta);

  const toggle = async () => {
    setBusy(true);
    try {
      if (on) await stealth.disable();
      else await stealth.enable();
      if (!on) toast.show('Private payouts on. Each bounty now lands on its own one-time address.', { tone: 'success' });
      // the registry entry outlives the switch, but only payers outside Nil use it
      else if (registered?.state === 'found') toast.show('Private payouts off. Bounties here go to your sign-in wallet. Your meta-address stays in the public registry for payers outside Nil.', { tone: 'success', timeout: 8000 });
      else toast.show('Private payouts off. New bounties go to your sign-in wallet.', { tone: 'success' });
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
              Each payout goes to a fresh address only your wallet can open (ERC-5564 stealth addresses), so your earnings can’t be traced to your sign-in wallet or added up. The payout keys come from your encryption keys and are only ever unlocked in this browser. The payer and the amount are still visible on-chain.
            </span>
          </span>
          {busy ? <Spinner size={16} /> : <button type="button" className="toggle" role="switch" aria-checked={on} onClick={toggle} aria-label="Receive bounties at one-time addresses" />}
        </label>
      </div>
      {meta && <StealthRegistry metaAddress={meta} onRead={setRegistered} />}
    </section>
  );
}
