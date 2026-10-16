# Proof file format

Nil gives every finished task a work receipt, and every confirmed bounty payment a payment receipt, both signed by the workspace. People collect their receipts into a proof file and share it with whoever needs to check their work. The format is open and small, so anyone can write a verifier. For how people use proofs in the app, see [Proof of work](proof-of-work.md).

A receipt can be trusted because it carries an Ed25519 signature from the workspace that issued it. Checking that signature needs no blockchain. A payment receipt also names an Ethereum transaction, so anyone can look the payment up on-chain as a second, independent check.

## Workspace key

Each Nil server generates an Ed25519 key pair on first use. It's stored in `DATA_DIR/keys/receipts-ed25519.pem`, outside the database, so a leaked database dump can't be used to forge receipts. Capsules carry the key, so a workspace that moves keeps its identity.

The public key is published at:

```
GET https://<workspace-domain>/.well-known/nonos-proof-key
{ "name": "Nil", "algorithm": "Ed25519", "key": "<base64url, 32 bytes>", "fingerprint": "dac6-f4fb-e063-2afb" }
```

The fingerprint is the first 8 bytes of `SHA-256(raw public key)`, written as hex in groups of four.

## Receipts

A receipt body is a JSON object serialized canonically: keys sorted, no whitespace, `undefined` fields left out. Those exact UTF-8 bytes are signed. The signature is Ed25519 over the canonical body bytes, encoded as base64url.

Every receipt, of either type, has these fields:

| Field | Meaning |
|---|---|
| `v` | Format version, `1` |
| `type` | `nonos.receipt` (work) or `nonos.payment` (payment) |
| `workspace` | Issuer `name` (as it was when the receipt was signed) and public `key` (base64url) |
| `seq` | Position in the workspace's receipt chain, starting at 1 |
| `prev` | Hex SHA-256 of the previous receipt body, or `null` for the first |
| `task.ref` | Human task key, like `NON-42` |
| `task.commit` | Hex `SHA-256(salt + ":" + title)`, or `null` when the server doesn't know the title. The title itself is never in the body |
| `contributor.id` | Opaque, stable id of the person in that workspace |
| `issuedAt` | When the receipt was signed (ISO 8601) |

Work and payment receipts share one chain. The `prev` links make the workspace's history of receipts tamper-evident: anyone holding a run of consecutive receipts can check that none were edited or reordered.

`task.commit` is `null` for an encrypted private task, whose title the server never sees, and for a payment confirmed after its task was erased.

### Work receipt

Signed when a task is marked done, for its assignee, or for whoever finished it if nobody was assigned.

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
  "workspace": { "key": "1Iwuq…", "name": "Nil" }
}
```

| Field | Meaning |
|---|---|
| `completedAt` | When the task was finished (ISO 8601) |
| `contributor.wallet` | The person's first linked wallet, lowercase. Present only if they turned on **Settings → Sign-in & security → Wallet in proofs of work** before the receipt was signed. Otherwise the field is left out |

### Payment receipt

Signed when the server has confirmed a bounty payment on-chain: the right token contract moved at least the full amount from an allowed payer to the contributor's address, under enough confirmations.

```json
{
  "contributor": { "id": "J9mzv949WB8l", "wallet": "0x5c…" },
  "issuedAt": "2026-10-15T12:04:51.904Z",
  "paidAt": "2026-10-15T12:04:51.902Z",
  "payment": {
    "amount": "250000000000000000000",
    "chainId": 1,
    "decimals": 18,
    "symbol": "NOX",
    "token": "0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca",
    "tx": "0x8f3e…"
  },
  "prev": "77c1b0e2…",
  "seq": 3,
  "task": { "commit": "9550b0bc…", "ref": "NON-3" },
  "type": "nonos.payment",
  "v": 1,
  "workspace": { "key": "1Iwuq…", "name": "Nil" }
}
```

| Field | Meaning |
|---|---|
| `contributor.wallet` | Always present: the address that received the payment, lowercase. For a normal payout it's the contributor's first linked wallet. For a private payout it's the one-time address the payment went to. The transaction already shows this address publicly, but the receipt links it to `contributor.id` for anyone who sees the receipt |
| `payment.chainId` | EIP-155 chain id of the network the payment was made on |
| `payment.token` | The token contract, lowercase |
| `payment.symbol`, `payment.decimals` | The token's symbol and decimals as configured on the server when the receipt was signed |
| `payment.amount` | The bounty amount in the token's smallest unit, as a decimal string |
| `payment.tx` | The transaction hash, lowercase |
| `paidAt` | When the server confirmed the payment (ISO 8601). This is not the block time |

A payment receipt has no `completedAt`. The payer's address isn't in the receipt, though it is public in the transaction.

## Proof file

```json
{
  "type": "nonos.proof",
  "v": 1,
  "exportedAt": "2026-10-15T12:00:00.000Z",
  "workspace": { "name": "Nil", "key": "1Iwuq…" },
  "contributor": { "name": "Jane Doe" },
  "receipts": [
    { "body": "<canonical receipt JSON string>", "sig": "<base64url>", "reveal": null },
    { "body": "…", "sig": "…", "reveal": { "title": "Ship governance dashboard", "salt": "<hex>" } }
  ]
}
```

- The contributor picks which of their receipts go into the file. Only their own receipts are offered.
- `contributor.name` is self-declared and unsigned. It's left out unless the contributor chooses to add it. Verifiers should label it that way.
- `reveal` is optional for each receipt. Without it, the verifier learns that a task with that reference was finished or paid, but not what it was.

## Verifying

For each receipt:

1. Parse `body` and check that `type` is `nonos.receipt` or `nonos.payment`.
2. Check `body.workspace.key == file.workspace.key`.
3. Verify the Ed25519 signature `sig` over the UTF-8 bytes of `body` with that key.
4. If `reveal` is present, check `hex(SHA-256(reveal.salt + ":" + reveal.title)) == body.task.commit`.
5. For `nonos.payment`, check that `payment.amount` is a decimal string, `payment.tx` is `0x` and 64 lowercase hex characters, and `payment.chainId` and `payment.decimals` are integers. To check the payment itself, look up `payment.tx` on chain `payment.chainId` and confirm it moved `payment.amount` of `payment.token` to `contributor.wallet`.

Then check across the file:

- Every receipt should carry the same `contributor.id`.
- To trust the issuer, compare `file.workspace.key`, or its fingerprint, with what the workspace publishes at `/.well-known/nonos-proof-key` on its own domain.

The built-in verifier at `/verify` does steps 1 to 5 and checks that every receipt belongs to the same person, in the browser, without uploading the file anywhere. It shows the key's fingerprint, says when the key is the server's own, and adds up the paid amounts per token. It doesn't query the chain itself. For payments on the chain the server is configured for, it links each transaction to the server's block explorer (`NOX_EXPLORER`), which opens only when clicked.

## What it proves

A valid proof shows that the workspace holding that key said this person finished those tasks at those times, and was paid those amounts in those transactions. A revealed title is the real title.

It doesn't show that the workspace itself is honest. You're trusting the issuer, much like trusting a reference letter, so check whose domain publishes the key. For payments, the chain is an independent witness: look the transaction up.

If a task is reopened, the server stops offering its work receipt for export. Payment receipts stay, because a payment that moved on-chain can't be undone. Copies exported earlier still verify mathematically.

Titles are salted commitments, so they can't be guessed by hashing likely titles. Contributor ids are opaque. A work receipt carries a wallet address only when the person opted in, but a payment receipt always carries the receiving address. Sharing the payment receipt of a private payout links that one-time address to you for everyone who sees the file, so leave it out of a proof if the payout should stay unlinked.
