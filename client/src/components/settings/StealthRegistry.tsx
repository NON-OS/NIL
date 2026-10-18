import { useCallback, useEffect, useState } from 'react';
import { Globe, RefreshCw, Send, TriangleAlert } from 'lucide-react';
import Spinner from '../ui/Spinner';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import stealthRegistry from '../../actions/stealthRegistry';
import shortAddress from '../../lib/shortAddress';
import type RegistryEntry from '../../types/RegistryEntry';

const READ_EVERY_MS = 6000;
const READS_AFTER_SENDING = 30;

function describe(entry: RegistryEntry, current: boolean) {
  const wallet = shortAddress(entry.wallet);
  if (current) return `Published. Your wallet ${wallet} has your current meta-address in the registry, so payers outside Nil can pay you privately too.`;
  if (entry.state === 'found') return `Your wallet ${wallet} has a different meta-address in the registry than your current one in Nil. Payers who look it up pay to that one, not to your current keys. Publish again to replace it.`;
  if (entry.state === 'invalid') return `Your wallet ${wallet} has something in the registry that isn’t a meta-address anyone can pay to. Publish to replace it.`;
  return `Not published. Payers outside Nil can’t find your meta-address from your wallet ${wallet}.`;
}

// Opt-in: your Nil meta-address in the public ERC-6538 registry, so anyone who knows your wallet
// address can pay you privately, from Nil or any other app. What it says is read back from the
// chain, never assumed from a transaction having been sent.
export default function StealthRegistry({ metaAddress, onRead }: { metaAddress: string; onRead: (entry: RegistryEntry | null) => void }) {
  const registry = useStore((s) => s.stealth?.registry ?? null);
  const [entry, setEntry] = useState<RegistryEntry | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const read = useCallback(async () => {
    try {
      const next = await stealthRegistry.mine();
      setEntry(next);
      setProblem(null);
      onRead(next);
      return next;
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Nil couldn’t read the registry. Try again in a minute.');
      return null;
    }
  }, [onRead]);

  useEffect(() => {
    if (registry) read();
  }, [registry, read]);

  // once the transaction is out, read back every few seconds until the registry shows it
  useEffect(() => {
    if (!waiting) return;
    let reads = 0;
    const timer = setInterval(async () => {
      const next = await read();
      reads += 1;
      if (next?.metaAddress === metaAddress || reads >= READS_AFTER_SENDING) {
        clearInterval(timer);
        setWaiting(false);
      }
    }, READ_EVERY_MS);
    return () => clearInterval(timer);
  }, [waiting, read, metaAddress]);

  const publish = async () => {
    setBusy(true);
    try {
      await stealthRegistry.publish(metaAddress);
      setConfirming(false);
      setWaiting(true);
      toast.show('Sent. It shows as published here once the transaction is mined.', { tone: 'success' });
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  if (!registry) return null;
  const current = entry?.state === 'found' && entry.metaAddress === metaAddress;

  return (
    <div className="settings-card">
      <span>
        <strong>
          <Globe size={14} style={{ verticalAlign: '-2px' }} /> Publish in the public stealth registry
        </strong>
        <br />
        <span className="muted">
          The registry (ERC-6538) lets anyone who knows your wallet address look up your meta-address and pay you privately, from Nil or any other app. It’s public by design: anyone can see that your wallet published this meta-address. Each payment still goes to a fresh one-time address that nobody can link to you.
        </span>
      </span>
      <span role="status">{problem ?? (entry ? describe(entry, current) : 'Checking the registry…')}</span>
      {confirming && entry ? (
        <>
          <div className="feed-warning" role="note">
            <TriangleAlert size={15} aria-hidden="true" />
            <span>
              Publishing is a transaction from your wallet {shortAddress(entry.wallet)} to the registry contract at {shortAddress(registry)}. Your wallet pays the network fee in ETH and shows it to you before you confirm. Once it’s mined, anyone can see the entry.
            </span>
          </div>
          <div className="settings-row">
            <button type="button" className="btn btn-primary" onClick={publish} disabled={busy}>
              {busy ? <Spinner size={14} /> : <Send />} Send from my wallet
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </>
      ) : waiting ? (
        <span className="muted">
          <Spinner size={14} /> Waiting for the transaction to be mined. This usually takes under a minute.
        </span>
      ) : (
        (entry || problem) && (
          <div className="settings-row">
            {entry && !current && (
              <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
                <Globe /> {entry.state === 'none' ? 'Publish' : 'Publish again'}
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={read}>
              <RefreshCw /> Check again
            </button>
          </div>
        )
      )}
    </div>
  );
}
