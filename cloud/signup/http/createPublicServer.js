import http from 'node:http';
import HttpError from '../../lib/HttpError.js';
import states from '../../provisioning/states.js';
import clientIp from '../clientIp.js';
import securityHeaders from './securityHeaders.js';
import contentSecurityPolicy from './contentSecurityPolicy.js';
import sendJson from './sendJson.js';
import readJson from './readJson.js';
import staticAssets from './staticAssets.js';
import etagMatches from './etagMatches.js';
import renderPages from './renderPages.js';

const NOTICES = {
  stopped: ['This workspace is offline for now', 'It has been stopped by the host and will be back.'],
  suspended: ['This workspace is paused', 'The host has paused it. Its data is kept.'],
  deleting: ['This workspace is being closed', 'It is scheduled for deletion and is no longer available.'],
  starting: ['This workspace is starting', 'Try again in a minute.'],
};
const DAY = 86_400_000;
// workspaces the control plane paused by itself say why, and what happens next
const REASONS = {
  [states.reasons.idle]: (w, config) => [
    'This workspace is paused',
    `Nobody has used it for a long time, so the host paused it. Its data is kept until ${new Date(w.suspendedAt + config.signup.idleNoticeDays * DAY).toISOString().slice(0, 10)}, and then deleted unless its owner asks the host to bring it back.`,
  ],
  [states.reasons.disk]: () => ['This workspace is paused', 'It holds more data than its plan allows, so the host paused it. Its data is kept; its owner can ask the host to bring it back.'],
};

// The public face of the control plane, behind Caddy: the sign-up page and its small JSON API,
// plus the notice shown for workspaces that aren't running. No cookies are ever set: the
// sign-up session is a ticket the page keeps in memory.
export default function createPublicServer(ctx, flow) {
  const phone = ctx.config.walletConnect;
  const assets = staticAssets({ phone: Boolean(phone) });
  const pages = renderPages(ctx.config);
  const csp = contentSecurityPolicy(phone?.relayUrl);
  const origin = `https://${ctx.config.signupHost}`;

  // Cross-site pages can't add custom headers without a CORS preflight, which is never
  // answered, so requiring one (plus a matching Origin) rules out cross-site requests.
  function guard(req) {
    if (req.headers['x-nil-signup'] !== '1') throw HttpError.forbidden('Request blocked. Reload the page and try again.');
    const from = req.headers.origin;
    if (from && from !== origin && !(ctx.config.trustProxy === 0 && from === `http://${req.headers.host}`)) throw HttpError.forbidden('Request blocked. Reload the page and try again.');
  }

  function html(res, status, body, extra = {}) {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...extra });
    res.end(body);
  }

  function unavailable(req, res) {
    const host = String(req.headers.host ?? '').toLowerCase().replace(/:\d+$/, '');
    const suffix = `.${ctx.config.domain}`;
    const workspace = host.endsWith(suffix) ? ctx.store.workspaces.byName(host.slice(0, -suffix.length)) : null;
    if (!workspace) return html(res, 404, pages.unavailable('There’s no workspace here', `Nothing is hosted at ${host || 'this address'}.`));
    const automatic = workspace.state === 'suspended' && REASONS[workspace.suspendReason]?.(workspace, ctx.config);
    const [title, detail] = automatic || NOTICES[workspace.state] || (states.routed.includes(workspace.state) ? NOTICES.starting : ['This workspace isn’t available', 'Try again later.']);
    // A paused or deleting workspace says so in a header, and the app's service worker then shows
    // this notice instead of the copy of the app it keeps for when the server is restarting.
    const paused = states.paused.includes(workspace.state) ? { 'x-nil-notice': workspace.state } : {};
    html(res, 503, pages.unavailable(title, detail), { 'retry-after': '60', ...paused });
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const ip = clientIp(req, ctx.config.trustProxy);
    securityHeaders(res, ctx.config.trustProxy > 0 && req.headers['x-forwarded-proto'] === 'https', csp);

    if (req.method === 'GET' || req.method === 'HEAD') {
      const asset = assets.get(url.pathname);
      if (asset) {
        const cached = { etag: asset.etag, 'cache-control': asset.cache };
        if (etagMatches(req.headers['if-none-match'], asset.etag)) {
          res.writeHead(304, cached);
          return res.end();
        }
        res.writeHead(200, { 'content-type': asset.type, ...cached, 'content-length': asset.body.length });
        return res.end(req.method === 'HEAD' ? undefined : asset.body);
      }
      if (url.pathname === '/unavailable') return unavailable(req, res);
      if (url.pathname === '/') return html(res, 200, pages.index(flow.closed()));
      if (url.pathname.startsWith('/api/names/')) {
        let name;
        try {
          name = decodeURIComponent(url.pathname.slice(11));
        } catch {
          throw HttpError.badRequest('That address isn’t valid.');
        }
        return sendJson(res, 200, flow.checkName(name, ip));
      }
      if (url.pathname === '/api/status') return sendJson(res, 200, flow.status(req.headers['x-signup-ticket']));
    }
    if (req.method === 'POST' && url.pathname === '/api/challenge') {
      guard(req);
      return sendJson(res, 200, flow.challenge(await readJson(req), ip));
    }
    if (req.method === 'POST' && url.pathname === '/api/verify') {
      guard(req);
      return sendJson(res, 200, flow.verify(await readJson(req), ip));
    }
    if (url.pathname.startsWith('/api/')) throw new HttpError(404, 'Unknown request.');
    html(res, 404, pages.unavailable('Page not found', 'There’s nothing at this address.'));
  }

  return http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (res.headersSent) return res.destroy();
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message }, err.extra.retryAfterSec ? { 'retry-after': String(err.extra.retryAfterSec) } : {});
      ctx.log.error('signup.error', { path: req.url?.split('?')[0], error: err });
      sendJson(res, 500, { error: 'Something went wrong on our side. Please try again.' });
    });
  });
}
