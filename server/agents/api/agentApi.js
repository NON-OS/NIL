import express from 'express';
import config from '../../config.js';
import tools from '../../mcp/tools.js';
import originAllowed from '../../security/originAllowed.js';
import principalFromRequest from '../principalFromRequest.js';
import agentRateLimit from '../agentRateLimit.js';
import runTool from '../runTool.js';
import buildOpenApi from './buildOpenApi.js';
import argsFromRequest from './argsFromRequest.js';
import expressPath from './expressPath.js';
import idempotency from './idempotency.js';
import pendingBody from '../pendingBody.js';
import sendError from './sendError.js';
import log from '../../lib/log.js';
import jsonDepthLimit from '../../lib/jsonDepthLimit.js';

const router = express.Router();
const serverUrl = (req) => `${config.appUrl ?? `${req.protocol}://${req.get('host')}`}/api/agent/v1`;

// The description of the API holds nothing about the workspace, so anyone may fetch it.
router.get('/openapi.json', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*').json(buildOpenApi(serverUrl(req)));
});

router.use((req, res, next) => {
  if (!originAllowed(req)) return sendError(res, 403, 'origin_not_allowed', 'Origin not allowed.');
  const { principal, error } = principalFromRequest(req);
  if (error) {
    if (error.status === 401) res.setHeader('WWW-Authenticate', 'Bearer realm="nonos", error="invalid_token"');
    return sendError(res, error.status, error.code, error.message);
  }
  const rate = agentRateLimit(principal);
  res.setHeader('RateLimit-Limit', rate.limit);
  res.setHeader('RateLimit-Remaining', rate.remaining);
  res.setHeader('RateLimit-Reset', rate.resetSeconds);
  if (!rate.allowed) {
    res.setHeader('Retry-After', rate.resetSeconds);
    return sendError(res, 429, 'rate_limited', `Over the limit of ${rate.limit} requests a minute. Try again in ${rate.resetSeconds} s.`);
  }
  req.principal = principal;
  next();
});

router.use(express.json({ limit: '256kb', verify: jsonDepthLimit(config.maxJsonDepth) }));

function handler(tool) {
  return (req, res) => {
    let args;
    try {
      args = argsFromRequest(tool, req);
    } catch (err) {
      return sendError(res, 400, 'invalid_arguments', err.message);
    }
    const key = tool.http.method === 'GET' ? undefined : req.get('Idempotency-Key');
    let fingerprint = null;
    if (key !== undefined) {
      if (!idempotency.valid(key)) return sendError(res, 400, 'invalid_idempotency_key', 'An Idempotency-Key is 1 to 200 printable characters with no spaces.');
      fingerprint = idempotency.fingerprint(req);
      const seen = idempotency.find(req.principal.key, key);
      if (seen) {
        if (seen.request_hash !== fingerprint) return sendError(res, 409, 'idempotency_conflict', 'This Idempotency-Key was already used for a different request.');
        const { GONE } = idempotency;
        if (!idempotency.replayable(seen, req.principal.user)) return sendError(res, GONE.status, GONE.code, GONE.message);
        res.setHeader('Idempotency-Replayed', 'true');
        return res.status(seen.status).json(JSON.parse(seen.response));
      }
    }
    const out = runTool(req.principal, tool.name, args, { via: 'rest' });
    const [status, body] = out.ok ? [tool.http.status ?? 200, out.data] : out.pending ? [202, pendingBody(out.pending)] : [out.error.status, { error: out.error }];
    // server errors aren't kept, so a retry after one gets a real second try
    if (key !== undefined && status < 500) idempotency.save(req.principal.key, key, fingerprint, status, body, out.taskId ?? null);
    res.status(status).json(body);
  };
}

// Literal paths go first, so /tasks/search is never read as the task called "search".
const ordered = [...tools].sort((a, b) => (a.http.path.match(/\{/g)?.length ?? 0) - (b.http.path.match(/\{/g)?.length ?? 0));
for (const tool of ordered) router[tool.http.method.toLowerCase()](expressPath(tool.http.path), handler(tool));

router.use((req, res) => sendError(res, 404, 'not_found', 'No such endpoint. The list is at /api/agent/v1/openapi.json.'));

router.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') return sendError(res, 413, 'too_large', 'The request body is too large.');
  if (err?.type === 'entity.parse.failed') return sendError(res, 400, 'invalid_json', 'The request body isn’t valid JSON.');
  if (err?.type === 'entity.too.deep') return sendError(res, 400, 'too_deep', 'The request body is nested too deeply.');
  log.error('agent api', `${req.method} ${req.baseUrl}${req.route?.path ?? ''} failed`, err);
  sendError(res, 500, 'server_error', 'Something went wrong on the Nil server.');
});

export default router;
