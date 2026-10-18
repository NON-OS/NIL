import './BackupWalletSteps.css';
import StepList from '../ui/StepList';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import vault from '../../actions/vault';

// How linking a backup wallet goes, with the step you're on marked: a signature from a wallet
// that's already linked, then the backup's own, and two more from the backup while your keys are
// unlocked, so it can open them too. Unlocking has to come first, because once the wallet has
// switched to the backup nothing here can open your keys.
export default function BackupWalletSteps({ confirmed }: { confirmed: boolean }) {
  const guest = useStore((s) => s.guest);
  const unlocked = useStore((s) => s.docsUnlocked);
  const steps = [
    { title: 'Confirm with the wallet you use now', detail: 'Click Link another wallet and sign once, so nobody can add a wallet with your open session alone.' },
    { title: 'Switch to the backup', detail: 'In your wallet, pick the other account, or connect the other wallet app.' },
    {
      title: 'Sign with the backup',
      detail: unlocked ? 'Click Link the new wallet. The backup signs three times: once so it can sign you in, twice for its own copy of your encryption keys.' : 'Click Link the new wallet and sign once, so the backup can sign you in.',
    },
  ];

  return (
    <div className="backup-steps">
      <StepList steps={steps} current={confirmed ? 2 : 1} />
      {!guest && !unlocked && !confirmed && (
        <p className="backup-steps-keys">
          Your encryption keys aren’t unlocked in this tab, so the backup won’t be able to open encrypted docs and private tasks. Unlock them first to include them.{' '}
          <button type="button" className="btn btn-sm" onClick={() => vault.unlock().catch(toast.error)}>
            Unlock your keys
          </button>
        </p>
      )}
    </div>
  );
}
