# Hosting NONOS as a Tor onion service

An onion service makes NONOS reachable only through Tor. It needs no domain name and no open ports, and neither side learns the other's network location.

## Start

```bash
docker compose -f docker-compose.yml -f docker-compose.tor.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.tor.yml exec tor cat /var/lib/tor/nonos/hostname
```

The second command prints your address (`…xyz.onion`). Open it in [Tor Browser](https://www.torproject.org/download/).

The onion address comes from keys stored in the `tor-keys` volume. Back that volume up if you want to keep the address.

## Notes

- You don't need HTTPS: Tor already encrypts and authenticates the connection end to end. NONOS detects plain HTTP and uses a standard cookie instead of the `__Host-` variant.
- Origin checks work automatically, because the browser's origin and the `Host` header are both the onion address.
- **Sign-in methods:** email and password work everywhere. Passkeys need a browser that treats `.onion` as a secure context and an authenticator it can reach. Wallet extensions are usually missing from Tor Browser.
- To make the server reachable *only* over Tor, remove the `ports:` section from `docker-compose.yml`.
