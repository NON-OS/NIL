// A transfer to the treasury matched to an invoice, or a transaction someone named for it.
export default interface InvoicePayment {
  id: string;
  txHash: string;
  token: string | null;
  symbol: string | null;
  amount: string | null;
  usd: number | null;
  onTime: boolean;
  status: 'seen' | 'confirming' | 'final' | 'failed' | 'dropped' | 'unmatched';
  problem: string | null;
  blockNumber: number | null;
  createdAt: number;
  finalAt: number | null;
}
