# Hosting Nil as a Tor onion service

An onion service makes Nil reachable through Tor. It needs no domain name and no open ports, and neither side learns the other's network location.

## Start

```bash
docker compose -f docker-compose.yml -f docker-compose.tor.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.tor.yml exec tor cat /var/lib/tor/nonos/hostname
```

The second command prints your address (`…xyz.onion`). Open it in [Tor Browser](https://www.torproject.org/download/).

The onion address comes from keys stored in the `tor-keys` volume. Back that volume up if you want to keep the address.

For running the onion service next to an HTTPS address, or on its own, see [section 9 of the deployment guide](DEPLOY.md#9-optional-tor-onion-service).

## Signing in over Tor

An Ethereum wallet is the only way to sign in to Nil. There are no passwords, passkeys or email. The app talks to an injected EIP-1193 wallet: a browser extension, or a wallet's own in-app browser.

- **Tor Browser ships without wallet extensions.** You can add one, but the Tor Project recommends against add-ons: they can bypass Tor or compromise your privacy, for example by making your browser stand out from other Tor users. Decide how your team will sign in before you rely on the onion address alone.
- **Your wallet makes its own network requests**, for example to its Ethereum node, and they don't necessarily go through Tor. Nil can't control them.
- **The sign-in message names a domain.** Wallets show it and may warn when it doesn't match the address bar. For onion-only use, leave `APP_URL` empty or set it to `http://<your-address>.onion`. With `APP_URL` set to your HTTPS address, onion visitors see that domain instead.

## Notes

- You don't need HTTPS: Tor already encrypts and authenticates the connection end to end. Nil detects plain HTTP and uses a standard cookie instead of the `__Host-` variant.
- Origin checks work automatically, because the browser's origin and the `Host` header are both the onion address.
- Encrypted docs use the browser's Web Crypto, which needs a secure context. Tor Browser treats `.onion` addresses as secure. Other browsers reaching the onion address over plain HTTP may not.
- All onion visitors reach Nil from the Tor container's address, so they share one set of rate limits.
- The onion service hides where the server is from its visitors. The server's own outgoing requests, to the Ethereum node in `NOX_RPC_URL` and to Anthropic if built-in AI is on, still leave over the normal network.
- To make the server reachable *only* over Tor, stop publishing its port. The deployment guide shows a small override file that does this.
