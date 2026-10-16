import { useEffect, useState } from 'react';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import http from '../../api/http';

// How much a Zero-State Pass counts in weighted votes, next to the NOX someone holds or stakes.
// Each new vote freezes the value in force when it opens, so changing it never rewrites a vote.
export default function VotePowerCard() {
  const nox = useStore((s) => s.nox);
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState('');
  const symbol = nox?.symbol ?? 'NOX';

  useEffect(() => {
    http.get<{ zspPower: string }>('/vote-power').then((r) => {
      setValue(r.zspPower);
      setSaved(r.zspPower);
    }).catch(toast.error);
  }, []);

  if (!nox) return <p className="muted">On-chain features are turned off on this server, so weighted votes aren’t available.</p>;

  const save = async () => {
    try {
      const r = await http.put<{ zspPower: string }>('/vote-power', { zspPower: value.trim() });
      setSaved(r.zspPower);
      toast.show(`One Zero-State Pass now counts as ${Number(r.zspPower).toLocaleString()} ${symbol} in new weighted votes.`, { tone: 'success' });
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="settings-card">
      <p style={{ margin: 0 }}>
        Weighted votes count {symbol} in members’ linked wallets, {symbol} they stake in the official staking contract, and every Zero-State Pass they hold at the power below.
      </p>
      <div className="settings-row">
        <label className="field" style={{ minWidth: 220 }}>
          <span>Power per Zero-State Pass, in {symbol}</span>
          <input className="input mono" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))} aria-label="Power per Zero-State Pass" />
        </label>
        <button type="button" className="btn" onClick={save} disabled={!value || value === saved}>
          Save
        </button>
      </div>
    </div>
  );
}
