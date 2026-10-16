import type InvoiceAmount from './InvoiceAmount';
import type InvoicePayment from './InvoicePayment';
import type PriceBreakdown from './PriceBreakdown';
import type InvoiceState from './InvoiceState';

// A Nil Pro invoice: a USD price, one exact amount per token, and the transfers seen for it.
export default interface Invoice {
  id: string;
  number: number;
  kind: 'periods' | 'seats';
  periods: number;
  people: number;
  seats: number;
  status: 'open' | 'paid' | 'expired' | 'cancelled';
  state: InvoiceState;
  zsp: boolean;
  price: PriceBreakdown;
  amounts: InvoiceAmount[];
  overpaidUsd: number;
  grantedDays: number;
  payments: InvoicePayment[];
  // blocks the server's Ethereum node could no longer show it while this invoice was open
  missedBlocks: { symbol: string; from: number; to: number }[];
  retryOf: string | null;
  startBlock: number;
  createdAt: number;
  expiresAt: number;
  paidAt: number | null;
  closedAt: number | null;
}
