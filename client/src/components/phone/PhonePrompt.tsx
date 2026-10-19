import './PhonePrompt.css';
import { Smartphone } from 'lucide-react';
import shortAddress from '../../lib/shortAddress';
import usePhonePending from '../../hooks/usePhonePending';
import usePhoneWallet from '../../hooks/usePhoneWallet';
import type PhoneRequest from '../../types/PhoneRequest';

const ASKING: Record<PhoneRequest['kind'], string> = {
  sign: 'Your phone wallet is asking you to sign a message. It isn’t a transaction and costs nothing.',
  pay: 'Your phone wallet is asking you to approve a transaction. Check the amount and the address there before you do.',
  network: 'Your phone wallet is asking to switch to the network this workspace uses.',
};

// Shown while a request waits for a tap on the phone: what it is, which wallet and address, and
// a way to stop waiting. It never takes focus; screen readers hear it when it appears.
export default function PhonePrompt() {
  const pending = usePhonePending();
  const phone = usePhoneWallet();
  const request = pending[pending.length - 1];
  if (!request) return null;
  const minutes = Math.max(1, Math.round((request.until - Date.now()) / 60_000));

  return (
    <aside className="phone-prompt" aria-labelledby="phone-prompt-title">
      <div className="phone-prompt-head">
        <Smartphone aria-hidden="true" />
        <strong id="phone-prompt-title">Confirm on your phone</strong>
      </div>
      <p role="status">{ASKING[request.kind]}</p>
      {phone.wallet && (
        <p className="phone-prompt-who">
          {phone.wallet.name}, <span className="mono">{shortAddress(phone.wallet.address)}</span>
        </p>
      )}
      <p className="phone-prompt-foot">
        Nil waits up to {minutes} {minutes === 1 ? 'minute' : 'minutes'}.{' '}
        <button type="button" className="phone-prompt-stop" onClick={request.cancel}>
          Stop waiting
        </button>
      </p>
    </aside>
  );
}
