export default interface ShareLink {
  id: string;
  kind: 'project' | 'task';
  targetId: string;
  createdBy: string | null;
  createdAt: number;
  expiresAt: number | null;
  views: number;
  lastViewedAt: number | null;
}
