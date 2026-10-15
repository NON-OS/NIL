export default interface Payment {
  id: string;
  taskId: string | null;
  taskRef: string;
  payerId: string | null;
  payeeId: string | null;
  to: string;
  from: string | null;
  amount: string;
  token: string;
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  problem: string | null;
  blockNumber: number | null;
  createdAt: number;
  confirmedAt: number | null;
}
