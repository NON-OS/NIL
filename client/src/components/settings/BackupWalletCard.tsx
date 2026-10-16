import './BackupWalletCard.css';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

// The standing advice above the wallet list: link a backup while there's only one wallet, and
// after a sign-in reset, remove the wallets that were lost.
export default function BackupWalletCard({ count, afterReset }: { count: number; afterReset: boolean }) {
  if (afterReset && count > 1) {
    return (
      <div className="backup-card" role="note">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>You’re back in with your new wallet.</strong>
          <p>If you no longer have your old wallets, remove them below so nobody else can sign in with them. Bounties are paid to the wallet at the top of the list.</p>
        </div>
      </div>
    );
  }
  if (count !== 1) return null;
  return (
    <div className="backup-card" role="note">
      <ShieldAlert aria-hidden="true" />
      <div>
        <strong>If you lose this wallet you lose your account; link a backup.</strong>
        <p>Use a different wallet from this one, like a hardware wallet or a second wallet app in this browser, so a lost device or recovery phrase can’t lock you out.</p>
      </div>
    </div>
  );
}
