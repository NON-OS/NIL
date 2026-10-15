import config from '../config.js';

// A missing Origin means a same-origin navigation or a non-browser client; both are fine.
export default function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const clean = origin.replace(/\/$/, '');
  if (config.allowedOrigins.includes(clean)) return true;
  try {
    const host = config.trustProxy ? req.headers['x-forwarded-host'] || req.headers.host : req.headers.host;
    return new URL(clean).host === host;
  } catch {
    return false;
  }
}
