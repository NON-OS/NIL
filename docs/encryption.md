# Encryption and trust

What Nil encrypts in the browser, who holds which key, what teammates check for each other, and what a server operator can still do. The code is in `client/src/lib/crypto`, `client/src/actions/vault.ts`, `client/src/actions/passkeys.ts`, `client/src/actions/keyDirectory.ts`, `server/keys` and `server/votes/encrypted`.

## Your identity

- The first time you unlock, your browser makes a random 32-byte seed. That seed is your identity. From it come, each by HKDF-SHA256 with its own label:
  - an X25519 key pair, which teammates seal doc keys, private-task keys and vote shares to;
  - an Ed25519 key pair, which signs what you write in docs and private tasks, and your steps as a trustee of an encrypted vote;
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
- The server is the only source for which wallets belong to whom, and a browser can't check that. So each browser pins every key the server lists the first time it sees it, in local storage (public data only, per site, workspace and account), and seals nothing to a key until you confirm it. If a teammate's published keys later differ from the pinned ones, the key shows as changed, with the old and new fingerprints, and nothing new is sealed to it until you confirm the change.
- The site, the workspace key and your account come from the server, again at every reconnect. Unlocking records the ones your keys were opened for, and pins and version records stay filed under those. If the server later names anything else, the browser locks your keys, says so, and until you reload it won't unlock them or file any pins in that tab. A server could otherwise move an unlocked browser to an empty set of pins and slip in a key of its own for a teammate you had already confirmed.
- When this browser holds pins for another workspace or account but none for the one the server names, Nil warns you at sign-in. That's expected the first time someone uses this browser, and otherwise a sign that the server may be starting your pins over.
- Clicking **Confirm** pins exactly the key on screen, and only if a fresh look at the directory still lists it. If the server swapped the key while you were comparing, nothing is confirmed and the window shows the new fingerprint. Any fetch that changes the listing redraws whatever shows keys.
- A signature counts only against a key you can see. That's a key you confirmed, or a key first seen for an active member, which the notice and **Teammates' keys** show while it's listed. A key first seen for someone deactivated, or for someone the workspace doesn't list, shows up there too, but counts only once you confirm it.
- When you confirm a teammate's new key, the one it replaces is kept if you had confirmed it as well. What they signed with it before the new key was published still checks out, since each signature carries its time, and says it was signed with their earlier key, with that key's fingerprint. Content in the older format carries no time and checks out only against the current key. A key you never confirmed isn't kept.
- A fingerprint is the first 80 bits of SHA-256 over both public keys, written as five groups of four hex digits. Yours is under **Encryption keys** in **Settings → Sign-in & security**, and every teammate's is under **Teammates' keys**. Compare fingerprints face to face or on a call, not in a message sent through the same workspace.
- Docs shows a notice when someone new appears with a key, someone's key changes, or a key appears for someone deactivated or not in the workspace, and anything that needs a teammate's key (sharing a doc, a private task for them, a trustee share) asks you to check it first. Team docs reach a newcomer only after a teammate has confirmed the newcomer's key.
- Each key statement shows teammates the address of the wallet that signed it. If you'd rather they didn't see a particular wallet, link another one and sign your keys with that.

## Docs

- Each doc has its own random AES-256-GCM key, sealed to every reader's X25519 key with a throwaway X25519 key, HKDF-SHA256 and AES-256-GCM. Taking someone out gives the doc a new key.
- The title and body of each version are signed by whoever saved it (Ed25519, as `nil/doc-version/v2`), over the doc, the field, the version number and the text, together with who the version is for (the whole team or specific people, and the readers it was sealed or saved for), a SHA-256 hash of the doc key and the time. Then each is encrypted with the doc, field and version as additional data.
- A version checks out when its signer is one of the readers it names, the doc key the reader unwrapped has the signed hash, and the signature verifies against a key the reader can see for the signer. Since anyone can seal a key to your public key, encryption alone doesn't show who wrote something or who it's for; the signature does, and the server holds no member's signing key. A version that doesn't check out opens with a warning and stays read-only; its creator or an admin can keep it by re-keying it, which signs it as theirs.
- Browsers hand a doc to newcomers only when its version is signed for the whole team, whatever the server lists, and save or share a doc only under the key its version checked out with.
- Each browser remembers the highest version of each doc it has verified and warns when the server serves an older one.

## The team pool key

- On a server with [pool payouts](private-payouts.md#pay-from-the-teams-pool) on, the team's Privacy Pools key is 16 random bytes made in an admin's browser and shown as a 12-word BIP-39 phrase, the format the Privacy Pools SDK takes. Every deposit's and withdrawal's secrets come from it as the SDK derives them, so the key and the chain alone recover the team's deposits.
- The key is sealed to each admin's X25519 key like a doc key, with its own label, and only to admins whose key the sealing admin confirmed. The server keeps the sealed copies and a public tag (HKDF-SHA256 of the key) that lets a browser check it opened the team's current key. It hands a sealed copy only to someone who is an admin now.
- The team's notes are encrypted with AES-256-GCM under a key derived from the pool key, bound to the tag, and saved over the revision they started from, so two admins can't overwrite each other.

## Private tasks

- Same scheme, with one key per task sealed to its creator and its assignee. The title, notes and checklist are each signed by whoever last saved them (`nil/task-words/v2`), together with the revision, the time, the creator and assignee the task is for, and a SHA-256 hash of the task key.
- A task opens only when its writer is one of those two, the key unwrapped has the signed hash, and the creator and assignee the server shows are among the signed ones. Someone can drop off a task, as when an account is removed, but nobody the writer didn't name can join it. A task whose words don't check out stays locked. The check runs again each time the server sends the task.
- Browsers hand a task's key over, or seal it again, only to the creator and assignee its writer signed. An edit takes them from the task as checked, never from the server alone.
- An assignee who gives the task to someone else isn't one of the new pair, so they sign as the one who handed it on. Their browser made the new key, so the next edit by the creator or the new assignee moves the task to a fresh key they never saw. Until then the task says who handed it on.
- Comments are signed over the task, the comment's own id, its author, an edit number and the time (`nil/task-comment/v2`) rather than the task's current key, so they keep their signatures when the task moves to a new key and the server can't swap one comment for another. The browser picks a new comment's id, so it can sign it. Each browser remembers the newest edit of each comment it has opened and the comments it saw deleted, and marks an older edit, or a deleted comment that comes back. When a task first turns private, its earlier plain comments are signed by the person who seals it, and a comment signed by anyone other than its author says who signed it.
- A file's name, type, size and SHA-256 are signed by whoever attached it, for the task and the file (`nil/task-file/v2`). A file whose details don't check out stays locked, and bytes that don't match what was signed don't open.
- A notification from your operating system says "A private task" instead of the title, since the system keeps its own history of notifications.

## Older formats

Docs, private tasks, comments and files saved before signatures named who they're for are in the older format. They still open when their signature checks out against a key you can see, and for a task when its writer is the creator or assignee the server shows, and they say they're in the older format. Nil never hands an older-format doc to the team, or an older-format task to anyone, on its own. The next save signs it in the new format, taking who it's for from the server at that moment: the audience and readers of a doc, the creator and assignee of a task. Editing a comment upgrades it. A file keeps the older format until it's attached again.

## Encrypted votes

- The three trustees run a distributed key generation on Baby Jubjub. Each first commits to a hash of their two coefficient commitments. Only when all three have committed does anyone reveal, together with a Schnorr proof of knowledge for each commitment, bound to the vote and the seat. The server and every browser check the proofs, so no trustee can publish a commitment whose secret they don't hold and steer the vote key to one only they know.
- Each trustee signs their commitment hash, and their reveal (the vote, the seat, their account, both commitments and a SHA-256 digest of the shares they sealed), with their Ed25519 signing key. Voters and trustees check both signatures against the key their browser pinned for that trustee, as for docs, so a server can't deal a seat itself and end up holding the vote key.
- Voters rebuild the vote key from the signed commitments and refuse to vote if the server's copy differs.
- A trustee's secret line is derived from their identity for that vote and seat, so setup can finish after a reload. Whoever could recompute it already holds that trustee's identity. Each trustee's browser checks that the dealing shown for its own seat is the one that line gives.
- As soon as all dealings are in, each trustee's browser checks the shares sealed to it against the dealers' commitments, and that the sealed shares are the ones their dealer signed. No ballot is taken until all three trustees report their shares in order.
- A trustee whose share doesn't match files a complaint naming the dealer, signed with their key. The dealer's browser answers only a complaint whose signature checks out against its pins, by showing that share, signed. The server checks it against the dealer's commitments, and so can anyone from the audit file. A matching share is used by the trustee who complained; one that doesn't match stops the vote for good.
- After the vote closes, each trustee's browser fetches every encrypted ballot, has the prover check its Groth16 proof against the circuit's verification key built into the app, checks its scope, option count, key and root, and that no nullifier appears twice, and adds the ballots up itself. It decrypts only if its sums equal the ones the server says it counted, and it remembers, per vote, the sums it decrypted, so it never decrypts other ones.
- The prover is a separate program, in the `prover` folder of the source code and under the GNU GPL, that the app starts in your browser as a Web Worker. The app sends it plain data, a circuit's inputs and files or a proof and its key, and gets back a proof or a yes or no. It makes and checks every proof Nil's browser side needs, ballots included, and like the rest of the app it can reach only your server.

## What a server operator can still do

- Serve different app code. All of the above assumes the JavaScript your browser runs is Nil's. An operator who changes it can read anything you unlock. [Check what a server sends](verify-a-server.md) compares a server with a release byte for byte; it can't see code sent only to one person or for a moment. Running a build you trust on a server you control is the strongest defence.
- See metadata: who can read which doc and when it changed, who created and is assigned each private task, sizes, times, and who is in the workspace.
- Decide who is in a vote's census and which ballots the trustees decrypt. A census the server made up for everyone isn't caught. Nor is a ballot it leaves out of what trustees get: it could hand them a single valid ballot, and the "totals" two trustees decrypt would be that ballot.
- Refuse service, delete data, or serve old data. Docs and private tasks carry a signed version or revision number, and a browser warns when the server sends an older one than it has already opened. A new browser or device has nothing to compare with.
- Get the first key in. If your browser has never seen a teammate's key, the first one it sees is pinned, and counts for their signatures while it's listed. Comparing fingerprints rules out a key the server made up. A new browser or device starts with no pins, and so does a workspace key or account your browser hasn't used before, which is why it warns when it holds pins for another one.
- Copy a private task's sealed contents onto another task for the same people. The words are still their writer's real words.
- Pass words off as a hand-on, with the help of a member whose key you trust. A browser can't tell a real hand-on from one made up by someone who was never on the task, since it may have missed who held the task in between. The task names whoever signed as handing it on, and its next edit moves it to a new key, so nothing written after that reaches them.
- Read with a former reader's help. Someone who once held a doc or task key can still read, with the server, what was saved under it, and an assignee who handed a task on holds its key until the next edit. They can't write under a key they never held, and a key of their own gets in only as the hand-on above, which the task names.

## Recovery and moves

- Lost the wallet you usually use: unlock with another linked wallet that has a wrap, or with a passkey.
- Keys gone from the server: if it lists no keys and no wraps for you, and no passkey either when you unlock with one, but this browser has seen you hold keys in the workspace (your own key pinned, or encrypted docs, tasks or comments opened here), unlocking stops and says so instead of making new keys. You restore from your kit, or start over only by choosing to.
- Lost every wallet with a wrap: an admin resets your sign-in and you link a new wallet with the one-time link. If one of your passkeys still works, unlock with it and add the new wallet to your keys. Otherwise restore from your recovery kit on the **Docs** screen that appears when the new wallet can't unlock. Without a kit, start over with new keys. Docs and private tasks sealed to the old keys must be shared again, teammates see your key as changed, and private payouts sent to your old keys stay with the old keys.
- Moving the workspace to a different web address changes the unlock messages, and passkeys stop working because they belong to the old address. Each member restores from their kit once, or starts over, and every browser's pins start over too, because they are stored per site. Passkeys can be added again at the new address.
- Losing the workspace signing key in `DATA_DIR/keys` changes the workspace key that every message names. No wrap opens after that, and the browser refuses recovery kits made for the old workspace key, so everyone starts over. Back that key up with the database.

## Limits

- Smart-contract wallets (EIP-1271), passkey wallets among them, can't publish keys yet: browsers check key statements by recovering the signer, which only works for ordinary accounts. A passkey added under **Encryption keys** only unlocks keys that an ordinary wallet published.
- The encrypted-vote circuit is beta and its trusted setup is a development ceremony. See the README's Honest limits.
