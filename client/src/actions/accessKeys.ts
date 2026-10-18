import http from '../api/http';
import type AccessKey from '../types/AccessKey';

const accessKeys = {
  list: () => http.get<AccessKey[]>('/me/tokens'),
  create: (input: { name: string; scope: 'read' | 'write'; days: number }) => http.post<{ token: string; tokens: AccessKey[] }>('/me/tokens', input),
  revoke: (id: string) => http.del<AccessKey[]>(`/me/tokens/${id}`),
};

export default accessKeys;
