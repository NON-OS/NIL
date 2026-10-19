import './Wallets.css';
import { ExternalLink, RotateCw } from 'lucide-react';
import QrCode from '../ui/QrCode';
import PhoneWalletOffer from '../phone/PhoneWalletOffer';
import walletApps from '../../lib/walletApps';
import wallets from '../../lib/wallets';
import isPhone from '../../lib/isPhone';

// For someone trying to sign in on a device with no wallet. Everything here is a link the person
// chooses to open; Nil itself loads nothing from any wallet maker. Where the server offers phone
// wallets, a computer can also use the wallet app on the person's phone over WalletConnect.
export default function NoWalletPanel({ onBack, onPhone }: { onBack: () => void; onPhone?: () => void }) {
  const here = location.href;
  const phone = isPhone();
  const tryAgain = () => {
    wallets.rescan();
    // most wallets only appear in pages opened after they were installed
    if (wallets.list().length) onBack();
    else location.reload();
  };

  return (
    <div className="auth-card no-wallet">
      <h1>First, a wallet</h1>
      <p className="lead">A wallet is a free app that holds a key only you have. Nil asks it to sign a short note, which proves it’s you without a password.</p>
      <p>That’s why Nil never needs your email or a password: there’s nothing for anyone to leak or steal. Signing in costs nothing and sends nothing.</p>

      {phone ? (
        <section className="no-wallet-step">
          <h2>Open Nil in your wallet app</h2>
          <p>Tap the wallet you have. Nil opens inside it, ready to sign in.</p>
          <div className="wallet-apps">
            {walletApps.map(({ name, openIn }) =>
              openIn ? (
                <a key={name} className="btn" href={openIn(here)} target="_blank" rel="noopener noreferrer">
                  {name}
                </a>
              ) : null,
            )}
          </div>
          <p className="method-hint">No wallet app yet? Install one of these from your app store, then come back to this page.</p>
        </section>
      ) : (
        <>
          {onPhone && <PhoneWalletOffer onPhone={onPhone} />}
          <section className="no-wallet-step">
            <h2>Add a wallet to this browser</h2>
            <p>Get one from its official site, then come back here.</p>
            <div className="wallet-apps">
              {walletApps.map(({ name, site }) => (
                <a key={name} className="btn" href={site} target="_blank" rel="noopener noreferrer">
                  {name} <ExternalLink aria-hidden="true" />
                </a>
              ))}
            </div>
          </section>
          <section className="no-wallet-step no-wallet-phone">
            <QrCode value={here} label="QR code that opens this page on your phone" size={132} />
            <div>
              <h2>Or use your phone</h2>
              <p>Point your phone’s camera at this code to open this page there, then open Nil in your wallet app.</p>
            </div>
          </section>
        </>
      )}

      <div className="no-wallet-actions">
        <button type="button" className="btn btn-primary btn-lg" onClick={tryAgain}>
          <RotateCw /> I have a wallet now
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
