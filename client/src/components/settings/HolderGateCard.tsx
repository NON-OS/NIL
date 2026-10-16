import { useEffect, useState } from 'react';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import http from '../../api/http';
import formatUnits from '../../lib/formatUnits';
import parseUnits from '../../lib/parseUnits';

interface Gate {
  enabled: boolean;
  minimum: string | null;
}

// The open door for token holders: anyone holding enough NOX (held, staked, or as
// Zero-State Passes) can join without an invite, and keeps being checked after that.
export default function HolderGateCard() {
  const nox = useStore((s) => s.nox);
  const [gate, setGate] = useState<Gate | null>(null);
  const [amount, setAmount] = useState('');
  const decimals = nox?.decimals ?? 18;
  const symbol = nox?.symbol ?? 'NOX';

  useEffect(() => {
    http
      .get<Gate>('/holder-gate')
      .then((g) => {
        setGate(g);
        setAmount(g.minimum ? formatUnits(g.minimum, decimals, decimals) : '');
      })
      .catch(toast.error);
  }, [decimals]);

  if (!nox) return <p className="muted">On-chain features are turned off on this server, so joining by holding {symbol} isn’t available.</p>;
  if (!gate) return null;

  const save = async (enabled: boolean) => {
    const minimum = parseUnits(amount, decimals);
    if (enabled && !minimum) return toast.show(`Enter how much ${symbol} someone needs to hold, like 1000.`, { tone: 'error' });
    try {
      setGate(await http.put<Gate>('/holder-gate', { enabled, minimum }));
      toast.show(enabled ? `Holders of ${formatUnits(minimum!, decimals)} ${symbol} can now join.` : 'Joining is invite-only again.', { tone: 'success' });
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="settings-card">
      <label className="filter-toggle" style={{ justifyContent: 'space-between' }}>
        <span>
          <strong>Let {symbol} holders join without an invite</strong>
          <br />
          <span className="muted">They join as members. {symbol} in their wallets, {symbol} staked and Zero-State Passes all count. Their holdings are checked when they join, at every sign-in and every few hours; someone who falls below gets a notice and a few days to hold enough again before they’re signed out. Removing their access works like for anyone else.</span>
        </span>
        <button type="button" className="toggle" role="switch" aria-checked={gate.enabled} onClick={() => save(!gate.enabled)} aria-label={`Let ${symbol} holders join`} />
      </label>
      <div className="settings-row">
        <label className="bounty-input" style={{ maxWidth: 260 }}>
          <span className="muted" style={{ whiteSpace: 'nowrap' }}>Minimum</span>
          <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1000" aria-label={`Minimum ${symbol}`} />
          <span className="muted">{symbol}</span>
        </label>
        <button type="button" className="btn" onClick={() => save(true)}>
          {gate.enabled ? 'Update minimum' : 'Open the door'}
        </button>
      </div>
    </div>
  );
}
