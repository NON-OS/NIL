export default interface SignInMethod {
  id: string;
  kind: 'passkey' | 'wallet';
  label: string;
  address: string | null;
  createdAt: number;
  lastUsedAt: number | null;
}
