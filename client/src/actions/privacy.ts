import http from '../api/http';
import type Retention from '../types/Retention';

const privacy = {
  get: () => http.get<{ retention: Retention; allowed: number[] }>('/privacy'),
  set: (retention: Partial<Retention>) => http.patch<{ retention: Retention; allowed: number[] }>('/privacy', { retention }),
  wipe: (confirm: string) => http.post('/privacy/wipe', { confirm }),
};

export default privacy;
