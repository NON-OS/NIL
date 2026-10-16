import type InvoiceState from '../../types/InvoiceState';

const LABEL: Record<InvoiceState, string> = {
  waiting: 'Waiting for payment',
  seen: 'Seen, not mined yet',
  confirming: 'Confirming',
  underpaid: 'Underpaid',
  paid: 'Paid',
  overpaid: 'Paid, with extra',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

const TONE: Record<InvoiceState, 'on' | 'warn' | 'off' | 'idle'> = {
  waiting: 'idle',
  seen: 'warn',
  confirming: 'warn',
  underpaid: 'off',
  paid: 'on',
  overpaid: 'on',
  expired: 'idle',
  cancelled: 'idle',
};

// The invoice's state in words, with a dot for tone; the words carry the meaning.
export default function InvoiceStateBadge({ state }: { state: InvoiceState }) {
  return <span className={`plan-badge ${TONE[state]}`}>{LABEL[state]}</span>;
}
