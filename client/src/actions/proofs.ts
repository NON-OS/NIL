import http from '../api/http';
import type Receipt from '../types/Receipt';

const proofs = {
  mine: () => http.get<{ key: string; fingerprint: string; receipts: Receipt[] }>('/proofs/mine'),
  serverKey: () => http.get<{ configured: boolean; name?: string; key?: string; fingerprint?: string }>('/proofs/key'),
};

export default proofs;
