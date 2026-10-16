// Where the workspace's Nil Pro stands. Guests only ever receive `unlocked`. Money is in
// micro-USD (USDC's precision); token amounts are strings in the token's smallest unit.
export default interface Plan {
  unlocked: boolean;
  // false in community mode: no treasury configured, so nothing is gated
  enforced?: boolean;
  active?: boolean;
  inGrace?: boolean;
  trial?: boolean;
  source?: 'paid' | 'zsp' | 'trial' | null;
  // when Pro (paid, pass or trial) ends, and when the paid tools lock after the grace period
  activeUntil?: number | null;
  lockAt?: number | null;
  paidUntil?: number | null;
  zsp?: { enabled: boolean; active: boolean; checkedAt: number | null };
  seatsUsed?: number;
  // null: no cap right now (community mode, trial or a Zero-State Pass)
  seatLimit?: number | null;
  freeSeats?: number;
  periodDays?: number;
  maxPeriods?: number;
  graceDays?: number;
  trialDays?: number;
  priceUsd?: number;
  seatUsd?: number;
  noxDiscount?: number;
  stakerTiers?: { stake: string; percent: number }[];
  burnShare?: number;
  tokens?: { symbol: string; address: string; decimals: number }[];
  treasury?: string | null;
  treasuryName?: string;
  invoiceHours?: number;
}
