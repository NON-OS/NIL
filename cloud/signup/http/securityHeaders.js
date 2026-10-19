// Every response from the sign-up site carries these, with the policy from contentSecurityPolicy.
export default function securityHeaders(res, secure, csp) {
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
