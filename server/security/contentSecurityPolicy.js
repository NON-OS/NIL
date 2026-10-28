// The Content-Security-Policy on every response. The page may connect only to this server, plus
// the WalletConnect relay when phone wallets are on, and the SFU of bigger calls when there is
// one, and nothing else in any directive.
export default function contentSecurityPolicy({ secure, relay = null, sfu = null }) {
  const connect = ["'self'", relay, sfu].filter(Boolean).join(' ');
  return [
    "default-src 'self'",
    // wasm-unsafe-eval lets the browser compile WebAssembly (the zero-knowledge prover) and nothing else: no eval of JavaScript
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect}`,
    // decrypted audio and video play from blob: URLs made in the page
    "media-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    ...(secure ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}
