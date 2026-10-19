import PhoneWalletPanel from './PhoneWalletPanel';

// The sign-in screens' step for connecting a wallet app on the phone. `onDone` carries on with
// whatever the person started, now with that wallet.
export default function PhoneWalletCard({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  return (
    <div className="auth-card">
      <h1>Use a wallet on your phone</h1>
      <p className="lead">For a computer without a wallet: Nil runs here, and your phone holds the key.</p>
      <PhoneWalletPanel onDone={onDone} />
      <div className="auth-links">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
