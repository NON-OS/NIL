import originAllowed from './originAllowed.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Browsers can't add a custom header to a cross-site request without a CORS preflight,
// and we never answer preflights, so requiring X-NONOS blocks CSRF outright.
export default function csrfGuard(req, res, next) {
  if (!MUTATING.has(req.method)) return next();
  if (req.headers['x-nonos'] !== '1' || !originAllowed(req)) {
    return res.status(403).json({ error: 'Request blocked. Reload the page and try again.' });
  }
  next();
}
