# Security policy

Nil exists to keep a team's work private. Security reports are taken seriously and handled quickly.

## Reporting a vulnerability

Please **don't open a public issue**. Report privately through GitHub's "Report a vulnerability" button on this repository (Security → Advisories). Include:

- what you found and where (file, route or screen),
- steps to reproduce, or a proof of concept,
- the impact you expect.

You'll get an acknowledgement within 72 hours and a plan within a week. Once a fix ships, you'll be credited in the release notes unless you'd rather stay anonymous.

## Scope

In scope: the server (`server/`), the web app (`client/`), the encrypted-ballot circuit (`circuits/`), the capsule format, the proof format, and the Docker and Tor setups in this repository.

Out of scope: your hosting provider, your reverse proxy setup, social engineering, and denial of service through raw traffic volume.

## Design summary

No part of Nil's own code has had an independent security audit. See [Honest limits](docs/privacy-model.md#honest-limits) in the privacy model.

- Sign-in: an Ethereum wallet is the only way in. There are no passwords, passkeys or email. The server writes an EIP-4361 message naming the domain in `APP_URL` (never one taken from the request), nonces are single-use, expire after 5 minutes and are capped per client, and the signer is recovered with EIP-191 using `@noble/curves` (secp256k1) and `@noble/hashes` (Keccak-256). Both libraries are widely used, and their own repositories list independent third-party audits of earlier versions. The versions Nil pins are newer than the audited ones.
- Sessions, invites, share links and access keys: random tokens, stored only as SHA-256 hashes. Cookies are `HttpOnly` and `SameSite=Lax`, with `Secure` and the `__Host-` prefix over HTTPS, where only the `__Host-` cookie is read. Signing out closes the session's live connection.
- Every write needs a custom header plus an origin check against `APP_URL` and `ALLOWED_ORIGINS`. Forwarded headers are believed only from the proxy named in `TRUST_PROXY`. A strict CSP is sent, with no inline scripts and no third-party hosts.
- Encrypted docs: each person's X25519 key is derived in the browser with HKDF-SHA256 from a deterministic wallet signature over a message bound to the workspace's signing key and the account. Each doc has its own AES-256-GCM key, sealed to every reader with an ephemeral X25519 key agreement. The server stores only ciphertext and sealed keys. Private tasks use the same scheme, with one key per task sealed to its creator and its assignee.
- Private payout and voting keys: derived the same way from a separate signature, so a leak of one set never exposes the other. They live only in the browser tab.
- Receipts: Ed25519, with the key stored outside the database and titles hidden behind salted commitments.
- Capsules: AES-256-GCM with a key from scrypt (N=2^17). The header is bound as associated data. Only allow-listed paths can be extracted, and restore only works on an empty server.
- Uploads: random file names, owner-only permissions, and forced download for anything that isn't an image or PDF. Files on private tasks are encrypted in the browser under a key of their own, wrapped under the task's key, and the server stores and serves them only as opaque bytes under a generic name.
- Docker images: local data, databases, `.env` files and keys are kept out of the build context, and removed again before the runtime image is assembled.
