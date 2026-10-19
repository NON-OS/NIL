import { lazy, Suspense } from 'react';
import PhonePrompt from './PhonePrompt';
import usePhoneWallet from '../../hooks/usePhoneWallet';

// the code and its drawing load only when a phone wallet is offered
const PhoneWalletDialog = lazy(() => import('./PhoneWalletDialog'));

// What every screen needs for phone wallets: the "Confirm on your phone" notice, and the offer to
// connect one when something asks for a wallet this browser doesn't have.
export default function PhoneWalletHost() {
  const { asking } = usePhoneWallet();
  return (
    <>
      <PhonePrompt />
      {asking && (
        <Suspense fallback={null}>
          <PhoneWalletDialog />
        </Suspense>
      )}
    </>
  );
}
