import { useState, type FormEvent } from 'react';
import { Landmark, Trash2 } from 'lucide-react';
import toast from '../../state/toast';
import bounties from '../../actions/bounties';

// Addresses that may pay bounties besides each admin's own wallets, e.g. a Safe multisig.
export default function TreasuryCard({ addresses, onChange }: { addresses: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('');

  const save = (next: string[]) => bounties.setTreasury(next).then(onChange).catch(toast.error);
  const add = (e: FormEvent) => {
    e.preventDefault();
    save([...addresses, draft.trim()]).then(() => setDraft(''));
  };

  return (
    <div className="settings-card">
      {addresses.map((a) => (
        <div key={a} className="member" style={{ gridTemplateColumns: '20px minmax(0, 1fr) auto' }}>
          <Landmark size={16} />
          <span className="mono" style={{ fontSize: 'var(--text-sm)', overflowWrap: 'anywhere' }}>{a}</span>
          <button type="button" className="btn btn-sm" onClick={() => save(addresses.filter((x) => x !== a))} aria-label={`Remove ${a}`}>
            <Trash2 />
          </button>
        </div>
      ))}
      <form className="bounty-paste" onSubmit={add}>
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="0x… treasury or Safe address" aria-label="Treasury address" spellCheck={false} />
        <button type="submit" className="btn" disabled={!/^0x[0-9a-fA-F]{40}$/.test(draft.trim())}>
          Add address
        </button>
      </form>
    </div>
  );
}
