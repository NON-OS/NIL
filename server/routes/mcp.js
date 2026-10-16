import express from 'express';
import rateLimit from '../auth/rateLimit.js';
import originAllowed from '../security/originAllowed.js';
import handleMessage from '../mcp/handleMessage.js';
import principalFromRequest from '../agents/principalFromRequest.js';
import agentRateLimit from '../agents/agentRateLimit.js';
import config from '../config.js';
import jsonDepthLimit from '../lib/jsonDepthLimit.js';

const router = express.Router();
const personalLimit = rateLimit({ windowMs: 60_000, max: 120, key: (req) => `mcp:${req.mcp.tokenId}`, message: 'Too many requests from this key. Slow down a little.' });

// Streamable HTTP transport for the Model Context Protocol, answering with plain JSON.
// Authenticated by personal access key or agent key only; cookies are never accepted here, so a
// web page can't ride a signed-in browser into it, and foreign origins are refused (DNS rebinding).
router.use((req, res, next) => {
  if (!originAllowed(req)) return res.status(403).json({ error: 'Origin not allowed.' });
  const { principal, error } = principalFromRequest(req);
  if (error) {
    if (error.status === 401) res.setHeader('WWW-Authenticate', 'Bearer realm="nonos", error="invalid_token"');
    return res.status(error.status).json({ error: error.message });
  }
  req.mcp = principal;
  next();
});
router.use((req, res, next) => {
  if (!req.mcp.agent) return personalLimit(req, res, next);
  const rate = agentRateLimit(req.mcp);
  if (rate.allowed) return next();
  res.setHeader('Retry-After', rate.resetSeconds);
  res.status(429).json({ error: 'This agent is over its request limit. Slow down a little.' });
});

router.post('/', express.json({ limit: '256kb', verify: jsonDepthLimit(config.maxJsonDepth) }), (req, res) => {
  if (Array.isArray(req.body)) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Batches are not supported.' } });
  const out = handleMessage(req.body, req.mcp);
  if (!out) return res.status(202).end();
  res.json(out);
});

// No server-initiated stream and no sessions to end.
router.all('/', (req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Use POST.' }));

export default router;
