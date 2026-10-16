// What an invoice costs, in micro-USD.
export default interface PriceBreakdown {
  baseUsd: number;
  seatsUsd: number;
  subtotalUsd: number;
  stakerPercent: number;
  stakerUsd: number;
  totalUsd: number;
  creditUsd: number;
  dueUsd: number;
  noxPercent: number;
}
