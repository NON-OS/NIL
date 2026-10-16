import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import plan from '../../actions/plan';
import formatUnits from '../../lib/formatUnits';
import shortAddress from '../../lib/shortAddress';
import usd from '../../lib/usd';
import type Revenue from '../../types/Revenue';

// What this workspace has paid for Nil Pro, and the published share of it that buys and burns
// NOX. The burn happens outside the app, by hand, and is published on-chain.
export default function RevenueCard({ refreshKey }: { refreshKey: number }) {
  const nox = useStore((s) => s.nox);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  useEffect(() => {
    plan.revenue().then(setRevenue).catch(toast.error);
  }, [refreshKey]);
  if (!revenue) return null;
  const symbol = nox?.symbol ?? 'NOX';
  return (
    <div className="settings-card">
      <div className="plan-facts">
        <div className="stat">
          <span className="stat-label">Paid for Nil Pro</span>
          <span className="stat-value">{usd(revenue.usd)}</span>
          <span className="stat-sub">{revenue.tokens.map((t) => `${formatUnits(t.amount, t.decimals, 4)} ${t.symbol}`).join(' · ') || 'Nothing yet'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Share that burns {symbol}</span>
          <span className="stat-value">{revenue.burnShare}%</span>
          <span className="stat-sub">{revenue.burnShare ? `${usd(revenue.burnUsd)} of yours` : 'No burn share is published'}</span>
        </div>
      </div>
      {revenue.burnShare > 0 ? (
        <p className="plan-fine">
          {revenue.burnShare}% of Nil Pro revenue buys {symbol} on the open market and sends it to the burn address, where nobody can move it again. The foundation does this by hand from {revenue.treasuryName}, and every burn is a public transaction anyone can check.
        </p>
      ) : (
        <p className="plan-fine">This server hasn’t published a burn share.</p>
      )}
      <div className="settings-row">
        {revenue.treasury && nox && (
          <a className="btn btn-sm btn-ghost" href={`${nox.explorer}/address/${revenue.treasury}`} target="_blank" rel="noopener noreferrer" title="Opens a block explorer in a new tab">
            <ExternalLink /> {revenue.treasuryName} {shortAddress(revenue.treasury)}
          </a>
        )}
        {revenue.burnReportUrl && (
          <a className="btn btn-sm btn-ghost" href={revenue.burnReportUrl} target="_blank" rel="noopener noreferrer" title="Opens in a new tab">
            <ExternalLink /> Published burns
          </a>
        )}
      </div>
    </div>
  );
}
