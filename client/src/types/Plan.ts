// Where the workspace's subscription stands. Guests only ever receive `unlocked`.
export default interface Plan {
  unlocked: boolean;
  // false in community mode: no treasury configured, so nothing is gated
  enforced?: boolean;
  active?: boolean;
  inGrace?: boolean;
  trial?: boolean;
  paidUntil?: number | null;
  // price of one period in the token's smallest unit
  price?: string;
  periodDays?: number;
  maxPeriods?: number;
  graceDays?: number;
  freeSeats?: number;
  seatsUsed?: number;
  treasury?: string | null;
}
