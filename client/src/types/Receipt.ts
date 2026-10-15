export default interface Receipt {
  id: string;
  seq: number;
  kind: 'work' | 'payment';
  ref: string;
  // payment receipts only
  amount: string | null;
  completedAt: string;
  // null once a retention policy or account deletion erased the private reveal data
  title: string | null;
  salt: string | null;
  body: string;
  signature: string;
}
