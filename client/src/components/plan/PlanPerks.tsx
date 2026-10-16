import { BadgePercent, Coins, KeyRound, Ticket } from 'lucide-react';
import useStore from '../../state/useStore';

// What holding NOX means for Nil Pro, in plain words.
export default function PlanPerks() {
  const status = useStore((s) => s.plan);
  const nox = useStore((s) => s.nox);
  const symbol = nox?.symbol ?? 'NOX';
  const tiers = status.stakerTiers ?? [];
  return (
    <div className="settings-card">
      <ul className="perk-list">
        {status.zsp?.enabled && (
          <li>
            <Ticket />
            <span>
              <strong>Zero-State Pass: Pro included.</strong> If the owner or an admin holds a Zero-State Pass in a wallet linked to their account, this workspace has Nil Pro without paying. It’s checked every few hours and whenever an invoice is made.
              {status.zsp.active ? ' Right now a pass covers this workspace.' : ''}
            </span>
          </li>
        )}
        {tiers.length > 0 && (
          <li>
            <Coins />
            <span>
              <strong>Stake {symbol}, pay less.</strong> When an admin stakes {symbol} in the official staking contract, invoices cost less:{' '}
              {tiers.map((t) => `${Number(t.stake).toLocaleString('en-US')} ${symbol} staked takes ${t.percent}% off`).join(', ')}. It’s read when the invoice is made.
            </span>
          </li>
        )}
        {(status.noxDiscount ?? 0) > 0 && (
          <li>
            <BadgePercent />
            <span>
              <strong>Pay in {symbol} for {status.noxDiscount}% off.</strong> The price is in US dollars; paying in {symbol} instead of USDC takes {status.noxDiscount}% off, at a rate read from the chain and locked into the invoice.
            </span>
          </li>
        )}
        <li>
          <KeyRound />
          <span>
            <strong>Hold {symbol} to join.</strong> When the token-holder door is open, {symbol} held, {symbol} staked and Zero-State Passes all count toward the minimum.
          </span>
        </li>
      </ul>
    </div>
  );
}
