import './Wallets.css';
import WalletIcon from './WalletIcon';
import type WalletOption from '../../types/WalletOption';

interface Props {
  wallets: WalletOption[];
  chosenId: string | null;
  onPick: (id: string) => void;
}

// One button per wallet in this browser, with the name and icon it announced.
export default function WalletChoices({ wallets, chosenId, onPick }: Props) {
  return (
    <ul className="wallet-list" aria-label="Wallets in this browser">
      {wallets.map((w) => (
        <li key={w.id}>
          <button type="button" className="wallet-option" aria-current={w.id === chosenId || undefined} onClick={() => onPick(w.id)}>
            <WalletIcon wallet={w} size={24} />
            <span>{w.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
