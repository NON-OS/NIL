import './BackupWalletNudge.css';
import { useSyncExternalStore } from 'react';
import { ShieldCheck } from 'lucide-react';
import backupNudge from '../../state/backupNudge';
import router from '../../lib/router';

const SECURITY = '/settings?tab=security';

// Right after sign-up, one quiet suggestion to link a second wallet. It goes away when followed
// or dismissed and never comes back on its own; Settings → Sign-in & security keeps the same advice.
export default function BackupWalletNudge() {
  const open = useSyncExternalStore(backupNudge.subscribe, backupNudge.get);
  if (!open) return null;

  return (
    <aside className="backup-nudge" aria-labelledby="backup-nudge-title">
      <ShieldCheck aria-hidden="true" />
      <div>
        <strong id="backup-nudge-title">Link a backup wallet</strong>
        <p>If you lose this wallet you lose your account. Link a second one so you can always get back in.</p>
        <div className="backup-nudge-actions">
          <a
            className="btn btn-primary btn-sm"
            href={SECURITY}
            onClick={(e) => {
              backupNudge.dismiss();
              router.link(SECURITY)(e);
            }}
          >
            Link a backup
          </a>
          <button type="button" className="btn btn-ghost btn-sm" onClick={backupNudge.dismiss}>
            Not now
          </button>
        </div>
      </div>
    </aside>
  );
}
