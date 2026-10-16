import '../bounty/Bounty.css';
import './Proofs.css';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileCheck2, XCircle } from 'lucide-react';
import proofs from '../../actions/proofs';
import verifyProof from '../../lib/verifyProof';
import dates from '../../lib/dates';
import cx from '../../lib/cx';
import type ProofCheck from '../../types/ProofCheck';
import type ProofKey from '../../types/ProofKey';
import formatUnits from '../../lib/formatUnits';

export default function VerifyPanel() {
  const [result, setResult] = useState<ProofCheck | null>(null);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const [serverKey, setServerKey] = useState<ProofKey | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    proofs.serverKey().then(setServerKey).catch(() => setServerKey(null));
  }, []);

  const check = async (file: File) => {
    setError('');
    setResult(null);
    if (file.size > 5 * 1024 * 1024) return setError('That file is too large to be a proof.');
    try {
      setResult(verifyProof(await file.text()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t read that file.');
    }
  };

  const fromHere = result && serverKey?.key === result.workspace.key;
  // payments on this server's chain link to its configured explorer; others get no link
  const explorer = serverKey?.explorer;
  const valid = result?.items.filter((i) => i.valid).length ?? 0;

  return (
    <div>
      <div
        className={cx('verify-drop', over && 'over')}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file) check(file);
        }}
      >
        <FileCheck2 size={28} />
        <strong style={{ color: 'var(--ink)' }}>Drop a proof file here, or click to choose one</strong>
        <span>It’s checked right here in your browser. Nothing is uploaded.</span>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files?.[0] && check(e.target.files[0])} />
      </div>

      {error && <div className="auth-error" style={{ marginTop: 14 }} role="alert">{error}</div>}

      {result && (
        <div className="verify-result" aria-live="polite">
          <div className={cx('verdict', result.ok ? 'good' : 'bad')}>
            {result.ok ? <CheckCircle2 /> : <XCircle />}
            {result.ok ? `Authentic: ${valid} receipt${valid === 1 ? '' : 's'} signed by “${result.workspace.name}”` : 'This proof failed verification'}
            {result.ok && result.paidTotals.length > 0 && ` · ${result.paidTotals.map((t) => `${formatUnits(t.amount, t.decimals)} ${t.symbol}`).join(' + ')} paid`}
          </div>
          {result.problems.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--danger)' }}>
              {result.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="panel">
            <div className="panel-body">
              <dl className="verify-facts">
                <dt>Workspace</dt>
                <dd>{result.workspace.name}</dd>
                <dt>Key fingerprint</dt>
                <dd className="mono">
                  {result.workspace.fingerprint}{' '}
                  {fromHere ? <span className="chip" style={{ color: 'var(--success)' }}>Issued by this server</span> : <span className="muted">· compare with the issuer’s /.well-known/nonos-proof-key</span>}
                </dd>
                <dt>Contributor</dt>
                <dd>
                  {result.declaredName ? <>{result.declaredName} <span className="muted">(name is self-declared)</span></> : <span className="muted">Not named</span>}
                  {result.contributorId && <div className="mono muted" style={{ fontSize: 'var(--text-xs)' }}>signed id {result.contributorId}</div>}
                </dd>
                {result.wallet && (
                  <>
                    <dt>Wallet</dt>
                    <dd className="mono">{result.wallet}</dd>
                  </>
                )}
              </dl>
            </div>
          </div>
          <div className="panel">
            {result.items.map((item) => (
              <div key={`${item.seq}-${item.ref}`} className="proof-row" style={{ gridTemplateColumns: '22px 84px minmax(0, 1fr) auto' }}>
                {item.valid ? <CheckCircle2 size={16} color="var(--success)" /> : <XCircle size={16} color="var(--danger)" />}
                <span className="ref mono muted">{item.ref}</span>
                <span className={cx('title', !item.title && !item.paid && 'hidden-title')}>
                  {item.paid && (
                    <a className="bounty-chip paid" href={explorer && item.paid.chainId === explorer.chainId ? `${explorer.url}/tx/${item.paid.tx}` : undefined} target="_blank" rel="noopener noreferrer" title={`Transaction ${item.paid.tx}`} style={{ marginRight: 8 }}>
                      Paid {formatUnits(item.paid.amount, item.paid.decimals)} {item.paid.symbol}
                    </a>
                  )}
                  {item.title ?? (item.paid ? '' : 'Title not revealed')}
                </span>
                <span className="date muted num" style={{ fontSize: 'var(--text-sm)' }}>{item.completedAt ? dates.short(item.completedAt.slice(0, 10)) : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
