import Modal from '../ui/Modal';
import PhoneWalletPanel from './PhoneWalletPanel';
import phoneWallet from '../../lib/phone/phoneWallet';

// Offered when something in the app needs a wallet and this browser has none. Closing it turns
// the request down; confirming a wallet carries it on.
export default function PhoneWalletDialog({ onDone, onClose }: { onDone?: () => void; onClose?: () => void }) {
  const close = () => {
    void phoneWallet.dismiss();
    onClose?.();
  };
  return (
    <Modal title="Use a wallet on your phone" onClose={close} width={520}>
      <div className="modal-body">
        <PhoneWalletPanel onDone={onDone} />
      </div>
    </Modal>
  );
}
