# Tor onion service

An onion service makes Nil reachable through Tor. It needs no domain name and no open ports, and neither side learns the other's network location.

## Start

The onion address only exists once Tor has run, and Nil needs it in `APP_URL` before anyone signs in. So the first start takes two steps.

1. Create `.env` from the example. Its `APP_URL=http://localhost:3000` lets the server start, and while it stays that way nobody can sign in or set up a workspace over the onion address, because that origin isn't allowed yet.

   ```bash
   cp .env.example .env
   chmod 600 .env
   docker compose -f docker-compose.yml -f docker-compose.tor.yml up -d --build
   docker compose -f docker-compose.yml -f docker-compose.tor.yml exec tor cat /var/lib/tor/nonos/hostname
   ```

   The last command prints your address (`…xyz.onion`).

2. Put that address in `.env`, choose an Ethereum node (see below), and restart Nil:

   ```bash
   APP_URL=http://<your-address>.onion
   NOX_RPC_URL=http://<your-node>:8545      # or off
   ```

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.tor.yml up -d --force-recreate nonos
   ```

Open the address in [Tor Browser](https://www.torproject.org/download/).

`docker-compose.tor.yml` removes Nil's published port, so the server answers only through Tor and not on its normal IP address.

The onion address comes from keys stored in the `tor-keys` volume. Back that volume up if you want to keep the address.

For running the onion service next to an HTTPS address, or on its own, see [section 9 of the deployment guide](deploy.md#9-optional-tor-onion-service).

## Signing in over Tor

An Ethereum wallet is the only way to sign in to Nil. There are no passwords, passkeys or email. The app talks to an injected EIP-1193 wallet: a browser extension, or a wallet's own in-app browser.

- Tor Browser ships without wallet extensions. You can add one, but the Tor Project recommends against add-ons: they can bypass Tor or compromise your privacy, for example by making your browser stand out from other Tor users. Decide how your team will sign in before you rely on the onion address alone.
- Your wallet makes its own network requests, for example to its Ethereum node, and they don't necessarily go through Tor. Nil can't control them.
- The sign-in message names a domain. Wallets show it and may warn when it doesn't match the address bar. For onion-only use, set `APP_URL` to `http://<your-address>.onion`. Next to an HTTPS address, keep `APP_URL` on the HTTPS address and add the onion address to `ALLOWED_ORIGINS`: onion visitors then see the onion address in the message. Nil never takes the domain from the request itself.

## Notes

- You don't need HTTPS: Tor already encrypts and authenticates the connection end to end. Nil detects plain HTTP and uses a standard cookie instead of the `__Host-` variant.
- Origin checks compare the browser's origin with `APP_URL` and `ALLOWED_ORIGINS` only. The `Host` header never counts.
- Encrypted docs and private tasks use the browser's Web Crypto, which needs a secure context. Tor Browser treats `.onion` addresses as secure. Other browsers reaching the onion address over plain HTTP may not.
- All onion visitors reach Nil from the Tor container's address, so they share one set of rate limits.
- The onion service hides where the server is from its visitors. The server's own outgoing requests, to the Ethereum node in `NOX_RPC_URL` and to Anthropic if built-in AI is on, still leave over the normal network. An onion server must name its own node in `NOX_RPC_URL` (or `off`): there is no public default, because a public node would see every address the server looks up, and from where.
- Leave `TRUST_PROXY` empty. Tor adds no forwarded headers, and nothing else sits in front of Nil.
- The Tor compose file stops publishing Nil's port, so the server answers only through Tor. The deployment guide shows how to run it next to HTTPS.
