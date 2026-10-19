// The sign-up pages load only their own script, stylesheet, fonts and icon. Nothing inline,
// nothing from another host, no frames, no forms posting elsewhere. With phone wallets on, the
// page may also open a WebSocket to WalletConnect's relay, and to nothing else.
export default function contentSecurityPolicy(relay) {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    "font-src 'self'",
    relay ? `connect-src 'self' ${relay}` : "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
