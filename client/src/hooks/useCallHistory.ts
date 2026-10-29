import { useEffect, useState } from 'react';
import useStore from '../state/useStore';
import callHistory, { type CallRecord } from '../actions/calls/callHistory';

// This browser's recent calls, kept up to date; null while the keys that open them are locked.
export default function useCallHistory() {
  const unlocked = useStore((s) => s.docsUnlocked);
  const [list, setList] = useState<CallRecord[] | null>(null);

  useEffect(() => {
    let gone = false;
    const load = () => void callHistory.list().then((l) => !gone && setList(l ? [...l] : null), () => !gone && setList(null));
    load();
    const stop = callHistory.subscribe(load);
    return () => {
      gone = true;
      stop();
    };
  }, [unlocked]);

  return list;
}
