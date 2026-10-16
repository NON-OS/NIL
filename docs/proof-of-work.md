# Proof of work

When you finish a task, the workspace signs a receipt saying you did it. When a bounty is paid to you, it signs a payment receipt that points to the transaction. You can collect your receipts in a proof file and give it to a DAO, a grant program, a client or an employer. They can check it without an account and without uploading it anywhere.

## Receipts

You get a work receipt when a task assigned to you is marked done. If nobody was assigned, the receipt goes to whoever marked it done. You get a payment receipt when a bounty paid to you is confirmed on the blockchain.

Task titles aren't written into receipts. Each receipt holds a fingerprint of the title instead, and you decide later whether to reveal the real title.

A work receipt includes your wallet address only if you turned on **Include my wallet address in new work receipts** in **Settings → Sign-in & security** before the receipt was signed. It's off by default, because it links your work to a public identity. A payment receipt always names the address the bounty was paid to.

If a finished task is reopened, its work receipt is no longer offered for proofs. Payment receipts stay, because a payment can't be undone.

## Download a proof

1. Open **Proof of work**.
2. Tick the receipts to include. All of them are ticked at first.
3. Click the eye next to a receipt to reveal its title in the proof, or click **Reveal all titles**. Hidden titles stay hidden.
4. Leave **Include my name** on to add your name, or turn it off.
5. Click **Download proof**. You get a JSON file.

The fingerprint under **Workspace key** identifies the key that signed your receipts.

Some titles can't be revealed, and the page shows "Title erased by a retention policy" in their place. The server never knew the title of an encrypted private task, so its receipts carry none. When a task is erased by the workspace's retention settings, or encrypted after it was finished, the data needed to reveal its title is deleted.

## Check a proof

Anyone can check a proof at `/verify` on a Nil server, signed in or not. The sign-in page links to it as **Verify a proof of work**. Drop the file on the page or click to choose it.

The check runs in the browser and nothing is uploaded. It shows:

- whether each receipt's signature is valid,
- whether each revealed title matches its receipt,
- whether every receipt belongs to the same person,
- the fingerprint of the key that signed them, and whether it is the key of the server you're on,
- the total paid per token.

For payments on the network the server uses, each transaction links to a block explorer, which opens only when you click it. The page doesn't look anything up on the blockchain itself.

To be sure who issued a proof, compare its key fingerprint with the one the workspace publishes at `/.well-known/nonos-proof-key` on its own domain.

## What a proof shows

A valid proof shows that the workspace holding that key said this person finished those tasks at those times, and was paid those amounts in those transactions. A revealed title is the real title.

It doesn't show that the workspace is honest. You trust the issuer, much as you'd trust a reference letter, so check whose domain publishes the key. For payments, the blockchain is a second, independent witness: look the transaction up.

The name in a proof is added by the person who downloaded it and isn't signed, so treat it as a claim.

Sharing the payment receipt of a [private payout](private-payouts.md) links that one-time address to you for everyone who sees the proof. Leave it out if the payout should stay unlinked.

## How it works

Receipts are signed with the workspace's Ed25519 key, which is kept outside the database. Each receipt includes a hash of the one before it, so edits and reordering show. A title is replaced by `SHA-256(salt + ":" + title)` with a random salt, so nobody can guess titles by hashing likely ones. The full format is in [Proof file format](proof-format.md).
