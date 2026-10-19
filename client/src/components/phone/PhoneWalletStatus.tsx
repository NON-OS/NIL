import '../auth/Wallets.css';
import { Smartphone } from 'lucide-react';
import phoneWallet from '../../lib/phone/phoneWallet';
import shortAddress from '../../lib/shortAddress';
import usePhoneWallet from '../../hooks/usePhoneWallet';

// The line under a wallet button while a phone wallet is connected: which one, and a way out.
export default function PhoneWalletStatus({ onChange }: { onChange?: () => void }) {
  const phone = usePhoneWallet();
  if (!phone.confirmed || !phone.wallet) return null;
  return (
    <p className="wallet-status">
      <Smartphone className="wallet-icon" width={16} height={16} aria-hidden="true" />
      <span>
        Using {phone.wallet.name} on your phone, <span className="mono">{shortAddress(phone.wallet.address)}</span>.
      </span>
      {onChange && (
        <button type="button" className="wallet-link" onClick={onChange}>
          Use another wallet
        </button>
      )}
      <button type="button" className="wallet-link" onClick={() => void phoneWallet.disconnect()}>
        Disconnect
      </button>
    </p>
  );
}
