import walletConnect from '../config/walletConnect.js';
import contentSecurityPolicy from './contentSecurityPolicy.js';
import calls from '../config/calls.js';

const relay = walletConnect.enabled ? walletConnect.relayUrl : null;
// Calls need this page's own camera, microphone and screen; no other page ever gets them.
const MEDIA = calls.enabled ? 'camera=(self), microphone=(self), display-capture=(self)' : 'camera=(), microphone=(), display-capture=()';
// the SFU's websocket, and the same address over http(s), where LiveKit checks a token first
const sfu = calls.enabled && calls.sfu ? `${calls.sfu.url} ${calls.sfu.url.replace(/^ws/, 'http')}` : null;
const CSP = { secure: contentSecurityPolicy({ secure: true, relay, sfu }), plain: contentSecurityPolicy({ secure: false, relay, sfu }) };

export default function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', req.secure ? CSP.secure : CSP.plain);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Permissions-Policy', `${MEDIA}, geolocation=(), payment=(), usb=(), interest-cohort=()`);
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}
