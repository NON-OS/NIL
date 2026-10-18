# Encryption and trust

What Nil encrypts in the browser, who holds which key, what teammates check for each other, and what a server operator can still do. The code is in `client/src/lib/crypto`, `client/src/actions/vault.ts`, `client/src/actions/keyDirectory.ts`, `server/keys` and `server/votes/encrypted`.

## Your identity

- The first time you unlock, your browser makes a random 32-byte seed. That seed is your identity. From it come, each by HKDF-SHA256 with its own label:
  - an X25519 key pair, which teammates seal doc keys, private-task keys and vote shares to;
  - an Ed25519 key pair, which signs what you write in docs and private tasks;
  - your private payout keys (ERC-5564 spending and viewing keys) and your anonymous voting key (Semaphore).
- The seed leaves your browser only wrapped. The server keeps one wrap per linked wallet: the seed under AES-256-GCM, with a key derived from that wallet's signature of its unlock message (below). That signature never leaves the browser, so the server can't open a wrap.
- Any linked wallet that has a wrap unlocks the same identity. Linking a wallet while your keys are unlocked gives it a wrap too, and **Add the wallet in your browser** under **Encryption keys** in **Settings → Sign-in & security** adds one later (see [Signing in](signing-in.md#add-a-wallet-to-your-keys)).
- Unlocked keys live only in the tab's memory and are wiped when you lock, sign out or reload.
- Optional recovery kit: a small JSON file with the seed under a passphrase (scrypt with N = 2^17, r = 8, p = 1, then AES-256-GCM, the same cost as workspace capsules). Everything else in the file is bound in as additional data, so it can't be edited to claim another account or a cheaper cost.

## Messages your wallet signs

Every key message has the Sign-In with Ethereum (EIP-4361) layout and names the site from `APP_URL`, which the server hands the browser at start-up. Wallets show that domain and warn when a different site asks for the signature. They are plain ASCII so hardware wallets can display them, and they name the workspace by its signing key, not its name, so renaming changes nothing.

| Message | When | Where the signature goes |
| --- | --- | --- |
| Unlock message | Once per wallet each time you unlock. It carries a nonce and date stored with that wallet's wrap, so each new wrap has its own message. | Nowhere. Stretched with HKDF, it becomes the key to that wallet's wrap. |
| Key statement | When you first set up, reset, restore, or re-sign after removing the wallet that signed before. It names your two public keys, your account, the workspace and the time. | To the server, which checks it, and to every teammate's browser, which checks it again. |

A new wrap signs its unlock message twice, because a wallet that signs the same message differently each time could never open the wrap again.

The server writes the messages for signing in and for signed ballots. A dishonest server could try to pass off a key message as one of those and collect its signature, so the browser refuses to sign any server-written text that carries the `urn:nil:` resources key messages use.

## The key directory, and what teammates check

- Publishing keys, or replacing them with a reset, needs a key statement signed in the last ten minutes by one of your linked wallets. The server checks the signature, the site, the workspace and the account. A stolen session cookie alone can't publish or reset keys.
- Every browser rebuilds each statement from the published fields and recovers the signer itself (secp256k1). A key whose statement doesn't check out is ignored.
- The server is the only source for which wallets belong to whom, and a browser can't check that. So each browser pins every teammate's keys the first time it sees them, in local storage (public data only, per site, workspace and account), and seals nothing to a key until you confirm it. If a teammate's published keys later differ from the pinned ones, the key shows as changed, with the old and new fingerprints, and nothing new is sealed to it until you confirm the change.
- A fingerprint is the first 80 bits of SHA-256 over both public keys, written as five groups of four hex digits. Yours is under **Encryption keys** in **Settings → Sign-in & security**, and every teammate's is under **Teammates' keys**. Compare fingerprints face to face or on a call, not in a message sent through the same workspace.
- Docs shows a notice when someone new appears with a key or someone's key changes, and anything that needs a teammate's key (sharing a doc, a private task for them, a trustee share) asks you to check it first. Team docs reach a newcomer only after a teammate has confirmed the newcomer's key.
- Each key statement shows teammates the address of the wallet that signed it. If you'd rather they didn't see a particular wallet, link another one and sign your keys with that.

## Docs

- Each doc has its own random AES-256-GCM key, sealed to every reader's X25519 key with a throwaway X25519 key, HKDF-SHA256 and AES-256-GCM. Taking someone out gives the doc a new key.
- The title and body of each version are signed by whoever saved it (Ed25519, over the doc, the field, the version number and the text), then encrypted with the doc, field and version as additional data.
- Readers check the signature against the writer's pinned key. Since anyone can seal a key to your public key, encryption alone doesn't show who wrote something; the signature does, and the server holds no member's signing key. A version without a valid signature opens with a warning and stays read-only; its creator or an admin can keep it by re-keying it, which signs it as theirs.
- Each browser remembers the highest version of each doc it has verified and warns when the server serves an older one.

## The team pool key

- On a server with [pool payouts](private-payouts.md#pay-from-the-teams-pool) on, the team's Privacy Pools key is 16 random bytes made in an admin's browser and shown as a 12-word BIP-39 phrase, the format the Privacy Pools SDK takes. Every deposit's and withdrawal's secrets come from it as the SDK derives them, so the key and the chain alone recover the team's deposits.
- The key is sealed to each admin's X25519 key like a doc key, with its own label, and only to admins whose key the sealing admin confirmed. The server keeps the sealed copies and a public tag (HKDF-SHA256 of the key) that lets a browser check it opened the team's current key. It hands a sealed copy only to someone who is an admin now.
- The team's notes are encrypted with AES-256-GCM under a key derived from the pool key, bound to the tag, and saved over the revision they started from, so two admins can't overwrite each other.

## Private tasks

- Same scheme, with one key per task sealed to its creator and its assignee. The title, notes and checklist are each signed by whoever last saved them, for that task key. A task whose words don't check out stays locked.
- Comments are signed over the task and the comment's author rather than the task's current key, so they keep their signatures when the task moves to a new key. When a task first turns private, its earlier plain comments are signed by the person who seals it.
- A notification from your operating system says "A private task" instead of the title, since the system keeps its own history of notifications.

## Encrypted votes

- The three trustees run a distributed key generation on Baby Jubjub. Each first commits to a hash of their two coefficient commitments. Only when all three have committed does anyone reveal, together with a Schnorr proof of knowledge for each commitment, bound to the vote and the seat. The server and every browser check the proofs, so no trustee can publish a commitment whose secret they don't hold and steer the vote key to one only they know.
- Voters rebuild the vote key from the revealed commitments and refuse to vote if the server's copy differs.
- A trustee's secret line is derived from their identity for that vote and seat, so setup can finish after a reload. Whoever could recompute it already holds that trustee's identity.
- As soon as all dealings are in, each trustee's browser checks the shares sealed to it against the dealers' commitments. A report of a bad share stops the vote from taking ballots, since its totals could never be decrypted.

## What a server operator can still do

- Serve different app code. All of the above assumes the JavaScript your browser runs is Nil's. An operator who changes it can read anything you unlock. [Check what a server sends](verify-a-server.md) compares a server with a release byte for byte; it can't see code sent only to one person or for a moment. Running a build you trust on a server you control is the strongest defence.
- See metadata: who can read which doc and when it changed, who created and is assigned each private task, sizes, times, and who is in the workspace.
- Refuse service, delete data, or serve old data. Docs and private tasks carry a signed version or revision number, and a browser warns when the server sends an older one than it has already opened. A new browser or device has nothing to compare with.
- Get the first key in. If your browser has never seen a teammate's key, the first one it sees is pinned. Comparing fingerprints rules out a key the server made up. A new browser or device starts with no pins.
- Copy a private task's sealed contents onto another task. The words are still their writer's real words.

## Recovery and moves

- Lost the wallet you usually use: unlock with another linked wallet that has a wrap.
- Lost every wallet with a wrap: an admin resets your sign-in, you link a new wallet with the one-time link, then restore from your recovery kit on the **Docs** screen that appears when the new wallet can't unlock. Without a kit, start over with new keys. Docs and private tasks sealed to the old keys must be shared again, teammates see your key as changed, and private payouts sent to your old keys stay with the old keys.
- Moving the workspace to a different web address changes the unlock messages. Each member restores from their kit once, or starts over, and every browser's pins start over too, because they are stored per site.
- Losing the workspace signing key in `DATA_DIR/keys` changes the workspace key that every message names. No wrap opens after that, and the browser refuses recovery kits made for the old workspace key, so everyone starts over. Back that key up with the database.

## Limits

- Smart-contract wallets (EIP-1271) can't publish keys yet: browsers check key statements by recovering the signer, which only works for ordinary accounts.
- The encrypted-vote circuit is beta and its trusted setup is a development ceremony. See the README's Honest limits.
