export default interface Receipt {
  id: string;
  seq: number;
  ref: string;
  completedAt: string;
  // null once a retention policy or account deletion erased the private reveal data
  title: string | null;
  salt: string | null;
  body: string;
  signature: string;
}
