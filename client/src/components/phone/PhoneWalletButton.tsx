import { Smartphone } from 'lucide-react';
import usePhoneWallet from '../../hooks/usePhoneWallet';

// "Use a wallet on your phone", where the server offers phone wallets, this isn't a phone, and no
// phone wallet is connected yet.
export default function PhoneWalletButton({ onClick, className = 'btn btn-lg', disabled = false }: { onClick: () => void; className?: string; disabled?: boolean }) {
  const phone = usePhoneWallet();
  if (!phone.enabled || phone.confirmed) return null;
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled}>
      <Smartphone aria-hidden="true" /> Use a wallet on your phone
    </button>
  );
}
