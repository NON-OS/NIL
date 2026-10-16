export default interface PlanPayment {
  id: string;
  txHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  problem: string | null;
  amount: string | null;
  periods: number | null;
  createdAt: number;
  confirmedAt: number | null;
}
