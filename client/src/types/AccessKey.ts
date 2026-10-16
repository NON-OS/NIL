export default interface AccessKey {
  id: string;
  name: string;
  scope: 'read' | 'write';
  createdAt: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
}
