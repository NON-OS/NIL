export default interface StealthPayout {
  id: string;
  taskRef: string;
  token: string;
  amount: string;
  address: string;
  ephemeralPublicKey: string;
  viewTag: number;
  txHash: string;
  status: 'pending' | 'confirmed';
  announced: boolean;
  createdAt: number;
  // what the one-time address held when last looked up, or null if it hasn't been yet; the
  // server reads these one address at a time, spread out, so they can lag a little
  balance: { eth: string; token: string } | null;
  balanceCheckedAt: number | null;
}
