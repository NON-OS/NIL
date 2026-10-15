import express from 'express';
import apiToken from '../auth/apiToken.js';
import rateLimit from '../auth/rateLimit.js';
import originAllowed from '../security/originAllowed.js';
import handleMessage from '../mcp/handleMessage.js';
import plan from '../services/plan.js';

const router = express.Router();

// Streamable HTTP transport for the Model Context Protocol, answering with plain JSON.
// Authenticated by personal access key only; cookies are never accepted here, so a web page
// can't ride a signed-in browser into it, and foreign origins are refused (DNS rebinding).
router.use((req, res, next) => {
  if (!originAllowed(req)) return res.status(403).json({ error: 'Origin not allowed.' });
  const auth = apiToken(req);
  if (!auth) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="nonos", error="invalid_token"');
    return res.status(401).json({ error: 'Send a NØNOS personal access key as "Authorization: Bearer nonos_pat_…".' });
  }
  if (!plan.status().unlocked) return res.status(402).json({ error: 'Connecting AI assistants needs an active NØNOS subscription.' });
  req.mcp = auth;
  next();
});
router.use(rateLimit({ windowMs: 60_000, max: 120, key: (req) => `mcp:${req.mcp.tokenId}`, message: 'Too many requests from this key. Slow down a little.' }));

router.post('/', express.json({ limit: '256kb' }), (req, res) => {
  if (Array.isArray(req.body)) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batches are not supported.' } });
  const out = handleMessage(req.body, req.mcp.user, req.mcp.scope);
  if (!out) return res.status(202).end();
  res.json(out);
});

// No server-initiated stream and no sessions to end.
router.all('/', (req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Use POST.' }));

export default router;
