# Proof of Contribution format

NONOS gives every finished task a **receipt** signed by the workspace. People collect their receipts into a **proof file** and share it with whoever needs to check their work: a DAO, a grant program, a client, an employer. The format is open and small, so anyone can write a verifier.

No blockchain is involved. A receipt is trustworthy because it carries an Ed25519 signature from the workspace that issued it.

## Workspace key

Each NONOS server generates an Ed25519 key pair on first use. It's stored in `DATA_DIR/keys/receipts-ed25519.pem`, outside the database, so a leaked database dump can't be used to forge receipts. Capsules carry the key, so a moved workspace keeps its identity.

The public key is published at:

```
GET https://<workspace-domain>/.well-known/nonos-proof-key
{ "name": "NONOS", "algorithm": "Ed25519", "key": "<base64url, 32 bytes>", "fingerprint": "dac6-f4fb-e063-2afb" }
```

The fingerprint is the first 8 bytes of `SHA-256(raw public key)`, written as hex in groups of four.

## Receipt

A receipt body is a JSON object serialized **canonically**: keys sorted, no whitespace, `undefined` fields left out. Those exact UTF-8 bytes are signed.

```json
{
  "completedAt": "2026-10-15T11:32:25.253Z",
  "contributor": { "id": "J9mzv949WB8l", "wallet": "0xab…" },
  "issuedAt": "2026-10-15T11:32:25.253Z",
  "prev": "1d441aae…",
  "seq": 2,
  "task": { "commit": "9550b0bc…", "ref": "NON-3" },
  "type": "nonos.receipt",
  "v": 1,
  "workspace": { "key": "1Iwuq…", "name": "NONOS" }
}
```

| Field | Meaning |
|---|---|
| `v`, `type` | Format version 1, type `nonos.receipt` |
| `workspace` | Issuer name and public key (base64url) |
| `seq` | Position in the workspace's receipt chain, starting at 1 |
| `prev` | Hex SHA-256 of the previous receipt body, or `null` for the first |
| `task.ref` | Human task key, like `NON-42` |
| `task.commit` | Hex `SHA-256(salt + ":" + title)`. The title itself is never in the body |
| `contributor.id` | Opaque, stable id of the person in that workspace |
| `contributor.wallet` | Only present if the person opted in to sharing their wallet address |
| `completedAt`, `issuedAt` | ISO 8601 timestamps |

The signature is Ed25519 over the canonical body bytes, encoded as base64url.

The `prev` links make the workspace's history of receipts tamper-evident. Anyone holding a run of consecutive receipts can check that none were edited or reordered.

## Proof file

```json
{
  "type": "nonos.proof",
  "v": 1,
  "exportedAt": "2026-10-15T12:00:00.000Z",
  "workspace": { "name": "NONOS", "key": "1Iwuq…" },
  "contributor": { "name": "Jane Doe" },
  "receipts": [
    { "body": "<canonical receipt JSON string>", "sig": "<base64url>", "reveal": null },
    { "body": "…", "sig": "…", "reveal": { "title": "Ship governance dashboard", "salt": "<hex>" } }
  ]
}
```

- `contributor.name` is **self-declared and unsigned**. Verifiers should label it that way.
- `reveal` is optional for each receipt. Without it, the verifier learns that a task with that reference was finished, but not what it was.

## Verifying

For each receipt:

1. Parse `body` and check `type == "nonos.receipt"`.
2. Check `body.workspace.key == file.workspace.key`.
3. Verify the Ed25519 signature `sig` over the UTF-8 bytes of `body` with that key.
4. If `reveal` is present, check `hex(SHA-256(reveal.salt + ":" + reveal.title)) == body.task.commit`.

Then check across the file:

- Every receipt should carry the same `contributor.id`.
- To trust the issuer, compare `file.workspace.key` (or its fingerprint) with what the workspace publishes at `/.well-known/nonos-proof-key` on its own domain.

The built-in verifier at `/verify` does all of this in the browser, without uploading the file anywhere.

## What it does and doesn't prove

- **It proves:** the workspace holding that key said this person finished those tasks at those times. A revealed title is the real title.
- **It doesn't prove** that the workspace itself is honest. You're trusting the issuer, much like trusting a reference letter. Check whose domain publishes the key.
- **Revocation:** if a task is reopened, the server stops offering that receipt for export. Copies exported earlier still verify mathematically.
- **Privacy:** titles are salted commitments, so they can't be guessed by hashing likely titles. Contributor ids are opaque. Wallet addresses appear only when the person opts in.
