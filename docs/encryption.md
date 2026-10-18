# Encryption and trust

What Nil encrypts in the browser, who holds which key, what teammates check for each other, and what a server operator can still do. The code is in `client/src/lib/crypto`, `client/src/actions/vault.ts`, `client/src/actions/passkeys.ts`, `client/src/actions/keyDirectory.ts`, `server/keys` and `server/votes/encrypted`.

## Your identity

- The first time you unlock, your browser makes a random 32-byte seed. That seed is your identity. From it come, each by HKDF-SHA256 with its own label:
  - an X25519 key pair, which teammates seal doc keys, private-task keys and vote shares to;
  - an Ed25519 key pair, which signs what you write in docs and private tasks;
  - your private payout keys (ERC-5564 spending and viewing keys) and your anonymous voting key (Semaphore).
- The seed leaves your browser only wrapped. The server keeps one wrap per linked wallet: the seed under AES-256-GCM, with a key derived from that wallet's signature of its unlock message (below). That signature never leaves the browser, so the server can't open a wrap. It also keeps one wrap per passkey you add (see [Passkeys](#passkeys)).
- Any linked wallet that has a wrap unlocks the same identity. Linking a wallet while your keys are unlocked gives it a wrap too, and **Add the wallet in your browser** under **Encryption keys** in **Settings → Sign-in & security** adds one later (see [Signing in](signing-in.md#add-a-wallet-to-your-keys)).
- Unlocked keys live only in the tab's memory and are wiped when you lock, sign out or reload. Locking and signing out also forget every private task, comment and file the tab opened with them.
- Optional recovery kit: a small JSON file with the seed under a passphrase (scrypt with N = 2^17, r = 8, p = 1, then AES-256-GCM, the same cost as workspace capsules). Everything else in the file is bound in as additional data, so it can't be edited to claim another account or a cheaper cost. A kit asking for more than 4 times the memory or 8 times the work of that cost is refused before anything runs, so a doctored file can't stall the tab.

## Messages your wallet signs

Every key message has the Sign-In with Ethereum (EIP-4361) layout and names the site from `APP_URL`, which the server hands the browser at start-up. Wallets show that domain and warn when a different site asks for the signature. They are plain ASCII so hardware wallets can display them, and they name the workspace by its signing key, not its name, so renaming changes nothing.

| Message | When | Where the signature goes |
| --- | --- | --- |
| Unlock message | Once per wallet each time you unlock. It carries a nonce and date stored with that wallet's wrap, so each new wrap has its own message. | Nowhere. Stretched with HKDF, it becomes the key to that wallet's wrap. |
| Key statement | When you first set up, reset, restore, or re-sign after removing the wallet that signed before. It names your two public keys, your account, the workspace and the time. | To the server, which checks it, and to every teammate's browser, which checks it again. |

A new wrap signs its unlock message twice, because a wallet that signs the same message differently each time could never open the wrap again.

The server writes the messages for signing in, for signed ballots and for applying to a bounty on the public board. A dishonest server could try to pass off a key message as one of those and collect its signature, so every server-written message goes through one check before the wallet sees it, and the browser refuses to sign any that carries the `urn:nil:` resources key messages use. Only key messages the browser builds itself are signed without that check. The sign-up page of hosted Nil makes the same check.

## Passkeys

- A passkey is one more wrap of your seed, next to the wallet wraps and the recovery kit. It only unlocks your keys. Signing in stays with your wallet, and so does publishing keys, because teammates check a key statement by recovering a wallet's signature.
- Adding a passkey needs your keys unlocked. The browser makes a passkey for the site's hostname (user verification required, ES256 or RS256) with the WebAuthn PRF extension, then asks that passkey for its PRF output for 32 random bytes made for it, the salt. HKDF-SHA256 with the label `nil/passkey-wrap/v1` turns the 32-byte output into a key, and AES-256-GCM wraps the seed, with your account, the workspace key and the passkey's credential id as additional data.
- Before saving, the browser asks the passkey a second time and keeps the wrap only if that output opens it again. It looks for an actual PRF output, never at the flags a browser reports about the extension. A passkey manager that gives no output can't hold your keys, and Nil says so and saves nothing.
- The server keeps the credential id, the salt, the wrap, the name you gave the passkey, and when it was added and last used. It never sees the PRF output or the seed, and it never checks the passkey's own signature. A passkey's details go only to its owner, in their own start-up data.
- Unlocking with a passkey asks for all of your passkeys at once, each with its own salt, and opens the wrap of the one you use. The seed then goes down the same path as after a wallet unlock: it has to derive the keys published for you, or it's wiped and refused.
- A passkey is never your only way back. Nil adds one only while a wallet holds your keys or you've downloaded a recovery kit for your current keys, and refuses to remove the last wallet that holds your keys while passkeys do and no kit was downloaded. For that, the browser tells the server when you download a kit for your current keys: the server learns that one exists, never what's in it.
- A passkey belongs to the site's hostname. If the workspace moves to a new address, its passkey wraps stop working.
- Removing a passkey deletes its wrap on the server and changes nothing about your keys, just as removing a wallet doesn't. It stays in your passkey manager until you delete it there. Starting over with new keys deletes every passkey wrap and the note that you have a kit, since the passkeys and the kit hold the old keys.

## The key directory, and what teammates check

- Publishing keys, or replacing them with a reset, needs a key statement signed in the last ten minutes by one of your linked wallets. The server checks the signature, the site, the workspace and the account. A stolen session cookie alone can't publish or reset keys.
- Every browser rebuilds each statement from the published fields and recovers the signer itself (secp256k1). A key whose statement doesn't check out is ignored.
- The server is the only source for which wallets belong to whom, and a browser can't check that. So each browser pins every teammate's keys the first time it sees them, in local storage (public data only, per site, workspace and account), and seals nothing to a key until you confirm it. If a teammate's published keys later differ from the pinned ones, the key shows as changed, with the old and new fingerprints, and nothing new is sealed to it until you confirm the change.
- The site, the workspace key and your account come from the server, again at every reconnect. Unlocking records the ones your keys were opened for, and pins and version records stay filed under those. If the server later names anything else, the browser locks your keys, says so, and until you reload it won't unlock them or file any pins in that tab. A server could otherwise move an unlocked browser to an empty set of pins and slip in a key of its own for a teammate you had already confirmed.
- When this browser holds pins for another workspace or account but none for the one the server names, Nil warns you at sign-in. That's expected the first time someone uses this browser, and otherwise a sign that the server may be starting your pins over.
- A fingerprint is the first 80 bits of SHA-256 over both public keys, written as five groups of four hex digits. Yours is under **Encryption keys** in **Settings → Sign-in & security**, and every teammate's is under **Teammates' keys**. Compare fingerprints face to face or on a call, not in a message sent through the same workspace.
- Docs shows a notice when someone new appears with a key or someone's key changes, and anything that needs a teammate's key (sharing a doc, a private task for them, a trustee share) asks you to check it first. Team docs reach a newcomer only after a teammate has confirmed the newcomer's key.
- Each key statement shows teammates the address of the wallet that signed it. If you'd rather they didn't see a particular wallet, link another one and sign your keys with that.

## Docs

- Each doc has its own random AES-256-GCM key, sealed to every reader's X25519 key with a throwaway X25519 key, HKDF-SHA256 and AES-256-GCM. Taking someone out gives the doc a new key.
- The title and body of each version are signed by whoever saved it (Ed25519, over the doc, the field, the version number and the text), then encrypted with the doc, field and version as additional data.
- Readers check the signature against the writer's pinned key. Since anyone can seal a key to your public key, encryption alone doesn't show who wrote something; the signature does, and the server holds no member's signing key. A version without a valid signature opens with a warning and stays read-only; its creator or an admin can keep it by re-keying it, which signs it as theirs.
- Each browser remembers the highest version of each doc it has verified and warns when the server serves an older one.

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
- Get the first key in. If your browser has never seen a teammate's key, the first one it sees is pinned. Comparing fingerprints rules out a key the server made up. A new browser or device starts with no pins, and so does a workspace key or account your browser hasn't used before, which is why it warns when it holds pins for another one.
- Copy a private task's sealed contents onto another task. The words are still their writer's real words.

## Recovery and moves

- Lost the wallet you usually use: unlock with another linked wallet that has a wrap, or with a passkey.
- Lost every wallet with a wrap: an admin resets your sign-in and you link a new wallet with the one-time link. If one of your passkeys still works, unlock with it and add the new wallet to your keys. Otherwise restore from your recovery kit on the **Docs** screen that appears when the new wallet can't unlock. Without a kit, start over with new keys. Docs and private tasks sealed to the old keys must be shared again, teammates see your key as changed, and private payouts sent to your old keys stay with the old keys.
- Moving the workspace to a different web address changes the unlock messages, and passkeys stop working because they belong to the old address. Each member restores from their kit once, or starts over, and every browser's pins start over too, because they are stored per site. Passkeys can be added again at the new address.
- Losing the workspace signing key in `DATA_DIR/keys` changes the workspace key that every message names. No wrap opens after that, and the browser refuses recovery kits made for the old workspace key, so everyone starts over. Back that key up with the database.

## Limits

- Smart-contract wallets (EIP-1271), passkey wallets among them, can't publish keys yet: browsers check key statements by recovering the signer, which only works for ordinary accounts. A passkey added under **Encryption keys** only unlocks keys that an ordinary wallet published.
- The encrypted-vote circuit is beta and its trusted setup is a development ceremony. See the README's Honest limits.
