import '../auth/Wallets.css';
import { Smartphone } from 'lucide-react';
import usePhoneWallet from '../../hooks/usePhoneWallet';

// On a computer or tablet without a wallet, where the server offers phone wallets: use the wallet
// app on the phone and stay on this screen.
export default function PhoneWalletOffer({ onPhone }: { onPhone: () => void }) {
  const phone = usePhoneWallet();
  if (!phone.enabled) return null;
  return (
    <section className="no-wallet-step">
      <h2>Use a wallet on your phone</h2>
      <p>Have a wallet app on your phone? Scan a code with it and keep using Nil here. You confirm each signature and payment on your phone.</p>
      <div className="wallet-apps">
        <button type="button" className="btn btn-primary" onClick={onPhone}>
          <Smartphone aria-hidden="true" /> Use a wallet on your phone
        </button>
      </div>
    </section>
  );
}
