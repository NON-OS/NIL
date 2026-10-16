import usd from '../../lib/usd';
import type PriceBreakdown from '../../types/PriceBreakdown';

interface Props {
  price: PriceBreakdown;
  kind: 'periods' | 'seats';
  periods: number;
  seats: number;
  periodDays: number;
  seatUsd: number;
}

// The price, line by line: the flat fee, the seats, the staker discount, credit, and what's due.
export default function PriceRows({ price, kind, periods, seats, periodDays, seatUsd }: Props) {
  const rows: [string, number][] = [];
  if (kind === 'periods') rows.push([`Nil Pro for ${periods * periodDays} days`, price.baseUsd]);
  if (seats > 0) rows.push([kind === 'seats' ? `${seats} more ${seats === 1 ? 'seat' : 'seats'} for the rest of the paid time` : `${seats} ${seats === 1 ? 'seat' : 'seats'} above the free ones, ${usd(seatUsd)} each per period`, price.seatsUsd]);
  if (price.stakerUsd > 0) rows.push([`Staker discount, ${price.stakerPercent}%`, -price.stakerUsd]);
  if (price.creditUsd > 0) rows.push(['Credit from earlier payments', -price.creditUsd]);
  return (
    <dl className="price-rows">
      {rows.map(([label, amount]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className="mono">{usd(amount)}</dd>
        </div>
      ))}
      <div className="price-total">
        <dt>Due</dt>
        <dd className="mono">{usd(price.dueUsd)}</dd>
      </div>
    </dl>
  );
}
