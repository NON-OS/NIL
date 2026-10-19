import './PhoneWallet.css';
import { useEffect } from 'react';
import { Copy, RotateCw, Smartphone } from 'lucide-react';
import QrCode from '../ui/QrCode';
import Spinner from '../ui/Spinner';
import StepList from '../ui/StepList';
import phoneWallet from '../../lib/phone/phoneWallet';
import phoneProtocol from '../../lib/phone/phoneProtocol';
import copyText from '../../lib/copyText';
import usePhoneWallet from '../../hooks/usePhoneWallet';

const STEPS = [
  { title: 'Open your wallet app', detail: 'On your phone: MetaMask, Rainbow, Trust Wallet or another wallet that works with WalletConnect.' },
  { title: 'Scan this code', detail: 'Use the scan button inside the wallet app. The phone’s camera app usually can’t open it.' },
  { title: 'Approve the connection', detail: 'Your wallet shows the name Nil and this site’s address. Then come back to this screen.' },
];
const MINUTES = Math.round(phoneProtocol.pairingSeconds / 60);

// The code a phone wallet scans, a link to copy instead, and where the connection has got to.
// Once the phone connects it shows the wallet's name and address, and nothing is signed until the
// person chooses to go on with that wallet.
export default function PhoneWalletPanel({ onDone }: { onDone?: () => void }) {
  const phone = usePhoneWallet();

  useEffect(() => {
    const now = phoneWallet.get();
    if (now.confirmed || !['starting', 'waiting', 'connected'].includes(now.status)) void phoneWallet.start();
    // leaving the panel drops a code or a connection nobody confirmed
    return () => {
      if (!phoneWallet.get().confirmed) void phoneWallet.dismiss();
    };
  }, []);

  const confirm = () => {
    phoneWallet.confirm();
    onDone?.();
  };

  if (phone.status === 'connected' && phone.wallet && !phone.confirmed) {
    return (
      <div className="phone-wallet">
        <p className="phone-wallet-state" role="status">
          Your phone connected.
        </p>
        <div className="phone-wallet-who">
          <Smartphone aria-hidden="true" />
          <div>
            <strong>{phone.wallet.name}</strong>
            <span className="mono">{phone.wallet.address}</span>
          </div>
        </div>
        <p>Check that your phone shows this same address. Nil asks this wallet for nothing until you continue, and you confirm each signature and payment on your phone.</p>
        <div className="phone-wallet-actions">
          <button type="button" className="btn btn-primary btn-lg" autoFocus onClick={confirm}>
            Continue with this wallet
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void phoneWallet.disconnect()}>
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="phone-wallet">
      <p>Scan the code with the wallet app on your phone and keep working here. Each signature and payment waits until you confirm it on your phone. The two talk through WalletConnect’s relay, encrypted end to end.</p>
      {phone.status === 'waiting' && phone.uri ? (
        <>
          <div className="phone-wallet-code">
            <QrCode value={phone.uri} label="Code for your phone wallet to scan" size={196} />
            <StepList steps={STEPS} current={0} />
          </div>
          <div className="phone-wallet-link">
            <label htmlFor="phone-wallet-link">Or copy the link into your wallet app</label>
            <div className="phone-wallet-copy">
              <input id="phone-wallet-link" className="input mono" readOnly value={phone.uri} onFocus={(e) => e.target.select()} spellCheck={false} />
              <button type="button" className="btn" onClick={() => void copyText(phone.uri!, 'Link copied. Paste it into your wallet app.')}>
                <Copy aria-hidden="true" /> Copy
              </button>
            </div>
          </div>
          <p className="phone-wallet-state" role="status">
            <Spinner size={13} /> Waiting for your phone. The code works for {MINUTES} minutes.
          </p>
        </>
      ) : phone.status === 'starting' ? (
        <p className="phone-wallet-state" role="status">
          <Spinner size={13} /> Getting a code from WalletConnect…
        </p>
      ) : (
        <>
          {phone.status === 'failed' && phone.message ? (
            <div className="auth-error" role="alert">
              {phone.message}
            </div>
          ) : (
            <p className="phone-wallet-state" role="status">
              {phone.status === 'expired' ? 'That code ran out before your phone used it.' : phone.message}
            </p>
          )}
          <div className="phone-wallet-actions">
            <button type="button" className="btn btn-primary" onClick={() => void phoneWallet.start()}>
              <RotateCw aria-hidden="true" /> Show a new code
            </button>
          </div>
        </>
      )}
    </div>
  );
}
