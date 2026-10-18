import { useEffect, useState } from 'react';
import useStore from '../state/useStore';
import bounties from '../actions/bounties';
import type PayeeStealth from '../types/PayeeStealth';

const OFF: PayeeStealth = { metaAddress: null, source: null, problem: 'off' };

// Whether a bounty to this person can be paid privately, and from which meta-address. A
// meta-address published in Nil is already here; otherwise the server looks the person's wallet
// up in the public registry. `loading` holds the pay button back until that answer is in.
export default function usePayeeStealth(userId: string | null): PayeeStealth & { loading: boolean } {
  const user = useStore((s) => (userId ? s.users[userId] : undefined));
  const chain = useStore((s) => s.stealth);
  const [found, setFound] = useState<{ userId: string; answer: PayeeStealth } | null>(null);
  const lookUp = Boolean(userId && chain?.registry && user?.address && !user.stealthMeta);

  useEffect(() => {
    if (!lookUp || !userId) return;
    let live = true;
    bounties
      .payee(userId)
      .catch((): PayeeStealth => ({ metaAddress: null, source: null, problem: 'unreadable' }))
      .then((answer) => live && setFound({ userId, answer }));
    return () => {
      live = false;
    };
  }, [lookUp, userId, user?.address]);

  if (!chain || !user) return { ...OFF, loading: false };
  if (user.stealthMeta) return { metaAddress: user.stealthMeta, source: 'nil', problem: null, loading: false };
  if (!lookUp) return { ...OFF, loading: false };
  return found?.userId === userId ? { ...found.answer, loading: false } : { ...OFF, loading: true };
}
