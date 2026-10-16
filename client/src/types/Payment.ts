export default interface Payment {
  id: string;
  taskId: string | null;
  taskRef: string;
  payerId: string | null;
  payeeId: string | null;
  to: string;
  from: string | null;
  // what arrived once confirmed; what Nil asked for until then
  amount: string;
  expected: string | null;
  token: string;
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled';
  state: 'sent' | 'confirming' | 'paid' | 'underpaid' | 'overpaid' | 'failed' | 'cancelled';
  problem: string | null;
  blockNumber: number | null;
  createdAt: number;
  confirmedAt: number | null;
  cancelledAt: number | null;
  stealth: boolean;
  announced: boolean;
  ephemeralPublicKey: string | null;
  viewTag: number | null;
}
