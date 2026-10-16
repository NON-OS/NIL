import { useRef, useState } from 'react';
import wallets from '../lib/wallets';
import useWallets from './useWallets';

type Stage = 'ready' | 'pick' | 'guide';

// What a "with your wallet" button does: go straight on with the only wallet there is, ask
// which one when there are several and none was picked on this device yet, or explain wallets
// when there are none.
export default function useWalletFlow() {
  const found = useWallets();
  const [stage, setStage] = useState<Stage>('ready');
  const next = useRef<(() => void) | null>(null);

  return {
    ...found,
    stage,
    start(run: () => void) {
      wallets.rescan();
      const all = wallets.list();
      if (!all.length) return setStage('guide');
      if (all.length > 1 && !all.some((w) => w.id === wallets.chosenId())) {
        next.current = run;
        return setStage('pick');
      }
      run();
    },
    pick(id: string) {
      wallets.choose(id);
      setStage('ready');
      const run = next.current;
      next.current = null;
      run?.();
    },
    change() {
      next.current = null;
      setStage('pick');
    },
    guide: () => setStage('guide'),
    back() {
      next.current = null;
      setStage('ready');
    },
  };
}
