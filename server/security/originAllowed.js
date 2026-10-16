import config from '../config.js';

// A missing Origin means a same-origin navigation or a non-browser client; both are fine. Any
// other origin must be configured: matching it against Host or X-Forwarded-Host would let a
// site that points its own name at this server pass.
export default function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return config.allowedOrigins.includes(origin.replace(/\/$/, ''));
}
