import http from '../api/http';
import type Receipt from '../types/Receipt';
import type ProofKey from '../types/ProofKey';

const proofs = {
  mine: () => http.get<{ key: string; fingerprint: string; receipts: Receipt[] }>('/proofs/mine'),
  serverKey: () => http.get<ProofKey>('/proofs/key'),
};

export default proofs;
