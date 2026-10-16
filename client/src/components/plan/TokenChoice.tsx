import usd from '../../lib/usd';
import type InvoiceAmount from '../../types/InvoiceAmount';

const SOURCE = { face: 'at face value', oracle: 'from the on-chain market', manual: 'set by this server' };

// Which token to pay in, with how each one is priced.
export default function TokenChoice({ amounts, chosen, onChoose, noxPercent }: { amounts: InvoiceAmount[]; chosen: string; onChoose: (token: string) => void; noxPercent: number }) {
  return (
    <div className="token-choice" role="radiogroup" aria-label="Pay in">
      {amounts.map((a) => (
        <button key={a.token} type="button" role="radio" aria-checked={chosen === a.token} className={`plan-choice btn${chosen === a.token ? ' on' : ''}`} onClick={() => onChoose(a.token)}>
          <strong>{a.symbol}</strong>
          <span className="muted">
            {a.rateSource === 'face' ? SOURCE.face : `${usd(Number(BigInt(a.rate) / 10n ** 12n))} each, ${SOURCE[a.rateSource]}${noxPercent ? `, ${noxPercent}% off` : ''}`}
          </span>
        </button>
      ))}
    </div>
  );
}
