import { Wallet } from 'lucide-react';
import type WalletOption from '../../types/WalletOption';

// The wallet's own icon from its announcement, or a plain wallet glyph when it sent none.
export default function WalletIcon({ wallet, size = 20 }: { wallet: WalletOption; size?: number }) {
  if (!wallet.icon) return <Wallet className="wallet-icon" width={size} height={size} aria-hidden="true" />;
  return <img className="wallet-icon" src={wallet.icon} width={size} height={size} alt="" draggable={false} />;
}
