# Security policy

NONOS exists to keep a team's work private. Security reports are taken seriously and handled quickly.

## Reporting a vulnerability

Please **don't open a public issue**. Report privately through GitHub's "Report a vulnerability" button on this repository (Security → Advisories). Include:

- what you found and where (file, route or screen),
- steps to reproduce, or a proof of concept,
- the impact you expect.

You'll get an acknowledgement within 72 hours and a plan within a week. Once a fix ships, you'll be credited in the release notes unless you'd rather stay anonymous.

## Scope

In scope: the server (`server/`), the web app (`client/`), the capsule format, the proof format, and the Docker and Tor setups in this repository.

Out of scope: your hosting provider, your reverse proxy setup, social engineering, and denial of service through raw traffic volume.

## Design summary

- Passwords: scrypt (N=2^14, r=8, p=1), minimum 10 characters, common-password check. Failed sign-ins take the same time whether or not the account exists.
- Passkeys: WebAuthn through SimpleWebAuthn, with attestation off so no device information is collected.
- Wallets: EIP-4361 messages written by the server, single-use nonces that expire after 5 minutes, and EIP-191 signer recovery with audited `@noble` libraries.
- Sessions and invites: random tokens, stored only as SHA-256 hashes. Cookies are `HttpOnly` and `SameSite=Lax`, with `Secure` and the `__Host-` prefix over HTTPS.
- Every write needs a custom header plus a same-origin check. A strict CSP is sent, with no inline scripts and no third-party hosts.
- Receipts: Ed25519, with the key stored outside the database and titles hidden behind salted commitments.
- Capsules: AES-256-GCM with a key from scrypt (N=2^17). The header is bound as associated data. Only allow-listed paths can be extracted, and restore only works on an empty server.
- Uploads: random file names, owner-only permissions, and forced download for anything that isn't an image or PDF.
