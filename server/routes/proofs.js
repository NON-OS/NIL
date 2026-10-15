import express from 'express';
import sql from '../db/sql.js';
import route from '../lib/route.js';
import signingKey from '../proofs/signingKey.js';

const router = express.Router();

// Your own receipts only, including the salt that lets you reveal a title.
router.get(
  '/proofs/mine',
  route((req) => ({
    key: signingKey.publicKey(),
    fingerprint: signingKey.fingerprint(),
    receipts: sql
      .all('SELECT * FROM receipts WHERE user_id = ? AND revoked_at IS NULL ORDER BY seq DESC', req.user.id)
      .map((r) => {
        const body = JSON.parse(r.body);
        return { id: r.id, seq: r.seq, ref: body.task.ref, completedAt: body.completedAt, title: r.title, salt: r.salt, body: r.body, signature: r.signature };
      }),
  })),
);

export default router;
