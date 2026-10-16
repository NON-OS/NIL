import './Wallets.css';
import WalletIcon from './WalletIcon';
import type useWalletFlow from '../../hooks/useWalletFlow';

// The line under a wallet button: which wallet will be used when there's a choice, or where to
// start when this device has none.
export default function WalletStatus({ flow }: { flow: ReturnType<typeof useWalletFlow> }) {
  if (flow.list.length > 1 && flow.chosen) {
    return (
      <p className="wallet-status">
        <WalletIcon wallet={flow.chosen} size={16} />
        <span>Using {flow.chosen.name}.</span>
        <button type="button" className="wallet-link" onClick={flow.change}>
          Use another wallet
        </button>
      </p>
    );
  }
  if (!flow.list.length && flow.settled) {
    return (
      <p className="wallet-status">
        <button type="button" className="wallet-link" onClick={flow.guide}>
          No wallet on this device yet? Here’s how to get started.
        </button>
      </p>
    );
  }
  return null;
}
