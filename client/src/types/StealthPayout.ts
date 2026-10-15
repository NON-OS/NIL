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
  // what the one-time address still holds right now, or null if the node didn't answer
  balance: { eth: string; token: string } | null;
}
