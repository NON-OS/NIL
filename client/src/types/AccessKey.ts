export default interface AccessKey {
  id: string;
  name: string;
  scope: 'read' | 'write';
  createdAt: number;
  // every key expires, including ones made before keys had to
  expiresAt: number;
  lastUsedAt: number | null;
}
