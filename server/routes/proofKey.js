import express from 'express';
import route from '../lib/route.js';
import signingKey from '../proofs/signingKey.js';
import publicWorkspace from '../services/publicWorkspace.js';

const router = express.Router();

// Public on purpose: anyone checking a proof can confirm which key this workspace signs with.
router.get(
  '/proofs/key',
  route(() => {
    const ws = publicWorkspace();
    if (!ws) return { configured: false };
    return { configured: true, name: ws.name, algorithm: 'Ed25519', key: signingKey.publicKey(), fingerprint: signingKey.fingerprint() };
  }),
);

export default router;
