import http from '../api/http';
import type ShareLink from '../types/ShareLink';

const shareLinks = {
  list: (kind: ShareLink['kind'], targetId: string) => http.get<ShareLink[]>(`/share-links?kind=${kind}&targetId=${encodeURIComponent(targetId)}`),
  create: (kind: ShareLink['kind'], targetId: string, days: number) => http.post<{ token: string; link: ShareLink }>('/share-links', { kind, targetId, days }),
  revoke: (id: string) => http.del(`/share-links/${id}`),
};

export default shareLinks;
