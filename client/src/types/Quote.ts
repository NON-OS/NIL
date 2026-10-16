import type PriceBreakdown from './PriceBreakdown';

// The price an invoice would have if it were made now, shown before paying.
export default interface Quote extends PriceBreakdown {
  kind: 'periods' | 'seats';
  periods: number;
  people: number;
  seats: number;
  seatUsd: number;
  noxDueUsd: number;
  staked: string;
  zsp: boolean;
  tokens: { symbol: string; address: string; decimals: number; rate: string; rateSource: 'face' | 'oracle' | 'manual'; usd: number; minimum: string }[];
}
