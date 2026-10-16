import './Wallets.css';
import WalletIcon from './WalletIcon';
import type WalletOption from '../../types/WalletOption';

interface Props {
  wallets: WalletOption[];
  chosenId: string | null;
  onPick: (id: string) => void;
  onBack: () => void;
}

export default function WalletPicker({ wallets, chosenId, onPick, onBack }: Props) {
  return (
    <div className="auth-card">
      <h1>Which wallet?</h1>
      <p className="lead">This browser has more than one wallet. Pick the one you use for Nil, and this device will remember it.</p>
      <ul className="wallet-list">
        {wallets.map((w) => (
          <li key={w.id}>
            <button type="button" className="wallet-option" aria-current={w.id === chosenId || undefined} onClick={() => onPick(w.id)}>
              <WalletIcon wallet={w} size={24} />
              <span>{w.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="auth-links">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
