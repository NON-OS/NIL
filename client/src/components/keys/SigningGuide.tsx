import './SigningGuide.css';
import { useSyncExternalStore } from 'react';
import { PenLine } from 'lucide-react';
import StepList from '../ui/StepList';
import signing from '../../state/signing';
import signingFlows from '../../lib/signingFlows';

// Shown while Nil asks the wallet for several signatures in a row: how many, what each one is
// for, and which one the wallet is asking for now. It sits beside the wallet's own window and
// never takes focus; screen readers hear each step as it comes.
export default function SigningGuide() {
  const current = useSyncExternalStore(signing.subscribe, signing.get);
  if (!current) return null;
  const { title, steps } = signingFlows[current.flow];
  const now = steps[current.step - 1];

  return (
    <aside className="signing-guide" aria-labelledby="signing-guide-title">
      <div className="signing-guide-head">
        <PenLine aria-hidden="true" />
        <strong id="signing-guide-title">{title}</strong>
      </div>
      <p className="signing-guide-count" role="status">
        {now ? `Signature ${current.step} of ${steps.length}: ${now.title}. Check your wallet.` : `Your wallet will ask you to sign ${steps.length} times.`}
      </p>
      <StepList steps={steps} current={current.step} />
      <p className="signing-guide-foot">None of these is a transaction, and none costs anything.</p>
    </aside>
  );
}
