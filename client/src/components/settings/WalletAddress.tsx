import { useState } from 'react';
import useCryptoTools from '../../hooks/useCryptoTools';
import shortAddress from '../../lib/shortAddress';

// Everyday teams go by names, so a wallet address stays folded away until someone asks for
// it. Crypto teams see it straight away, as before.
export default function WalletAddress({ address }: { address: string }) {
  const cryptoTools = useCryptoTools();
  const [shown, setShown] = useState(false);
  if (cryptoTools || shown) {
    return (
      <span className="mono" title={address}>
        {shortAddress(address)}
      </span>
    );
  }
  return (
    <button type="button" className="wallet-reveal" onClick={() => setShown(true)}>
      Show wallet
    </button>
  );
}
