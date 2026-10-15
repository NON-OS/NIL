import type Payment from './Payment';

export default interface BountyOverview {
  // amounts are whole token units of the smallest denomination, as text
  people: { userId: string; promised: string; owed: string; paid: string }[];
  payments: Payment[];
  treasury: string[];
}
