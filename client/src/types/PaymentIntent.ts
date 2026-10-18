// What Nil asked a bounty payer to send: exactly `amount` of `token` to `to`, mined after the
// moment it was made. A private payout carries the one-time key's public half.
export default interface PaymentIntent {
  id: string;
  taskId: string;
  to: string;
  token: string;
  amount: string;
  stealth: boolean;
  ephemeralPublicKey: string | null;
  viewTag: number | null;
  via: 'pool' | null;
  createdAt: number;
  expiresAt: number;
}
