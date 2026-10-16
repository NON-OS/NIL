import WalletChoices from './WalletChoices';
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
      <WalletChoices wallets={wallets} chosenId={chosenId} onPick={onPick} />
      <div className="auth-links">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
