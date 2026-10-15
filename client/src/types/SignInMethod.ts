export default interface SignInMethod {
  id: string;
  kind: 'wallet';
  label: string;
  address: string;
  createdAt: number;
  lastUsedAt: number | null;
}
