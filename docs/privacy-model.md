# Privacy model

This page lists what Nil protects and what it doesn't. It covers who can see what inside a workspace, what the person running the server can read, and what leaves the server.

## Inside the workspace

- Private tasks are shown only to their creator and their assignee. Admins don't see them.
- Your timesheet, your reminders and your My Day list are yours alone.
- Docs are shown only to the people they're shared with, and the files in Files only to the people their shared folder is for.
- Conversations in [chat](chat.md) are shown only to the people in them. Guests and agents aren't part of chat.
- Wallet addresses, last-seen times, private payout addresses and voting-key commitments are shown only to admins and to the person themselves. Teammates see the name each person picked. The one exception is the wallet that signed your encryption keys: members see its address next to your key fingerprint, so they can check the key. To show a different one, add another wallet to your keys, remove the wallet that signed, and unlock again: Nil then asks the wallet you're using to sign your keys.
- Bounty payments are shown only to admins and to the person paid, because a transaction reveals the receiving wallet.
- Guests see only the projects shared with them and the tasks assigned to them.
- In an anonymous vote, nobody, admins included, can see who chose what.
- A built-in AI request sent [anonymously](ai-assistants.md#anonymous-requests) isn't tied to anyone in the server's records. Admins see only how many were made each day.
- The audit file of a sealed vote, which lists every ballot, is ready only once the vote closes.
- A call with a person is visible only to the people in it and the people rung. Everyone on the team can see that a project call is going on and who is in it, as they can see who is online. Guests don't get calls.

## What the server operator can read

Some things are encrypted in your browser with keys the server never has:

- [encrypted docs](encrypted-docs.md), titles included,
- [chat](chat.md) messages, reactions, files and their names, and channel names and topics,
- [files](files.md) in shared folders and inside docs, with their names, types, thumbnails and pixel sizes, and the names of folders,
- the title, notes, checklist, comments and files of [private tasks](private-tasks.md), file names and types included,
- the ballots of [encrypted weighted votes](votes.md#encrypted-weighted-votes-beta).

Everything else is stored in plain form in the server's database, where anyone with access to the server or its backups can read it:

- team tasks, their comments and their history,
- files on team tasks, with their names,
- the size of every file, including encrypted ones, to within a few bytes per megabyte,
- which shared folders exist, who can open each one, how many files and folders each holds, how they nest and which files have a thumbnail, which says they're images,
- goals, projects and labels,
- time entries, reminders and their notes,
- the list of people, their names, roles and wallet addresses,
- the names you give your passkeys, when each was added and last used, and whether you've downloaded a recovery kit (never the kit itself),
- for members who joined through the token-holder door, which account each wallet's NOX last counted for, kept until 3 days after it last counted, even once the wallet is unlinked,
- bounty amounts and payment records,
- signed votes, with each voter's wallet and choice.

For a conversation, the server knows who is in it, who sent each message, reaction, edit or deletion and when, how large it is, which thread it's in, who the sender mentioned, how far each person has read, each epoch's signed list of who holds the key, the signed statements that someone left, and when each sending tab published its mark. [Chat](chat.md#what-the-server-can-see) has the full list.

[Calls](calls.md) never reach the server in a form it can open: sound, video and screens go from browser to browser, or through the SFU for bigger calls as frames encrypted in the browser, end to end either way and through the relay when one is set up. Nothing is recorded. The server passes the handshake and the frame keys between the browsers, sealed so it can't read them, not even the network addresses inside, and signed so it can't change them unnoticed, and knows who is in which call and when they joined and left. It keeps that on disk while the call lasts, so the call survives a restart, never in its logs or backups, and deletes it when the call ends, or after 12 hours at the latest. Who stopped whom ringing them is kept until they change it.

For a private task, the server still knows that it exists, who created it, who it's assigned to, its status, dates, project, labels and the other fields listed in [Private tasks](private-tasks.md#what-is-encrypted-and-what-isnt). For a doc, it knows who can read it, who changed it and when. For a file in a shared folder, it knows who added it, renamed it or moved it and when.

The server also hands out everyone's public keys, and the ones they replaced, each with the wallet signature it was published with, so what they signed before still checks out. Teammates' browsers check those keys and the signatures on what each person writes. Once you've compared fingerprints with someone, the server can't swap their key or change their words without your browser noticing. Each signature also names who the writing is for and which key protects it, so the server can't get a private task or doc handed to someone the writer didn't name, or have you write under a key of its own. [Encryption and trust](encryption.md) explains the checks and what an operator could still do.

## What leaves your server

Your browser loads nothing from other hosts. Nil has no analytics, trackers, CDNs, third-party fonts or third-party scripts. The fonts, the zero-knowledge circuit files and the PDF viewer, with the decoders and fonts it uses, are served by your own server. Files you preview are decrypted and shown in your browser, never sent anywhere to be converted. Zero-knowledge proofs (anonymous ballots, encrypted ballots, anonymous AI credits and private payouts) are made and checked in your browser by the prover, a separate program your server also sends, which the app runs as a Web Worker and talks to only by messages. The Content Security Policy only allows connections to the server itself, so the app can't contact another host. Block-explorer links open only when you click them. Your wallet extension makes its own network requests, which Nil doesn't control.

The one exception is a [wallet on your phone](signing-in.md#use-a-wallet-on-your-phone). On a server that sets `WALLETCONNECT_PROJECT_ID`, the policy also allows WalletConnect's relay, and a browser connects to it only while someone uses a phone wallet. The relay, run by WalletConnect's operator, carries end-to-end encrypted messages between the computer and the phone. It can't read them, but it sees connection metadata: both IP addresses, timing and message sizes, the browser, the workspace's address and the project ID, and, from wallet apps built on WalletConnect's software, the hash of a transaction they send.

The server itself contacts other hosts in these cases:

- Its Ethereum node, set by `NOX_RPC_URL`, to check payments, balances, stakes and Zero-State Passes, and to pass on the transactions you sign when you move a private payout. That node sees which addresses and transactions your server looks up, and your server's IP address. A server people reach over the network has to name one; only a server on localhost falls back to a public node. Privacy-minded teams should run their own. `NOX_RPC_URL=off` turns every on-chain feature off.
- With Nil's verifier (`NOX_VERIFIER_MODE`, see [Verified chain reads](self-hosting.md#verified-chain-reads)), the verifier asks its execution node about the same addresses and transactions, plus the Merkle proofs that check them. In shadow mode the server asks its own node too, so with two different nodes both see each lookup; with one, it learns nothing more than before. The verifier also follows the beacon chain through a consensus API, which only learns that a light client is following it, never what Nil looks up.
- Anthropic, only when the operator set `ANTHROPIC_API_KEY` and only when someone clicks an AI button. Each feature sends only the text it needs, never a private task, and never who asked. See [AI assistants](ai-assistants.md#built-in-ai).
- The push service of a browser maker (Google, Apple, Mozilla or Microsoft), only for people who turned on push notifications on a device. Each notification is encrypted for that device, so the push service sees only that one arrived, when, and from which server. The server posts only to the hosts in `PUSH_SERVICES`, and `PUSH_NOTIFICATIONS=off` stops it altogether. See [Time and reminders](time-and-reminders.md#push-notifications).

- Nothing for calls. The TURN relay is the operator's own, usually on the same machine. It sees the IP address of everyone in a call and when they talk, and carries the call encrypted, so it never hears or sees it. The SFU, when there is one, sees encrypted frames, their sizes and timing, and names that don't say who anyone is or which call it is. By default each browser in a call sees only the relay's address, never another person's. An admin who allows direct connections lets browsers in a call learn each other's addresses. See [Calls](calls.md#how-calls-stay-private).

- The Privacy Pools relayer and association set provider, only on a server with [pool payouts](private-payouts.md#pay-from-the-teams-pool) on and only for admins using the team pool. The server reaches only the hosts in `PRIVACY_POOLS_RELAYER_URL` and `PRIVACY_POOLS_ASP_URL`, on a fixed few paths, refuses redirects, and passes on nothing about the admin: no cookie, no IP address, no headers of theirs. What each one learns is under [The team pool](#the-team-pool).

If you connect your own AI assistant over MCP, the assistant fetches from Nil, and whatever it reads goes on to that assistant's provider.

## What is public on purpose

- On-chain payments are public, like any Ethereum transaction. [Private payouts](private-payouts.md) hide which person a payout belongs to, but the payer, the token, the amount and the time are still visible. Moving funds from a one-time address to a wallet people know links them.
- Without signing in, anyone can see the workspace name, whether the token-holder door is open and its minimum, the public proof key, the [public bounty board](public-bounty-board.md), any share link they hold, and the tasks in any [calendar feed](views.md#your-tasks-in-your-own-calendar-app) link they hold.

## The team pool

Paying bounties from a [Privacy Pools](private-payouts.md#pay-from-the-teams-pool) pool keeps the chain from linking the team's wallet to the people it pays. It doesn't make the team invisible. What each party can see:

- Anyone can see each deposit: the wallet that made it, the token, the amount and the time. That's the point where the team's money visibly enters the pool.
- Anyone can see each withdrawal: the pool, the amount, the fee, the one-time address it went to and the time. What nobody can see on the chain is which deposit paid it; the proof shows only that it was one of the deposits the association set approved.
- The association set provider (0xbow on mainnet) decides which deposits may leave privately. It sees every deposit and who made it, like everyone else, and can decline one, which leaves only a public ragequit to the depositing wallet. Nil downloads the whole association set, the same file for every team, so that tells the provider nothing. Asking it about particular deposits (**Ask the provider**, needed to tell a declined deposit from one still under review) tells it that this server holds them, which is why an admin has to ask.
- The relayer sends each withdrawal and is paid its fee from it. It sees the one-time address, the amount and the Nil server's IP address, never an admin's. On Sepolia the default relayer is 0xbow's; on mainnet the operator picks one. If the relayer and the association set provider are run by the same people and they compare notes, the server's IP address ties the team's questions about its deposits to its withdrawals.
- Nil's server knows which bounties were paid from the pool and which deposits the team made, as it knows every payment. The pool key and the notes are sealed and encrypted in admins' browsers, so the server can't spend the pool or read which deposit paid what, but an operator who watches the API can line up deposits and payouts by time.
- The Ethereum node in `NOX_RPC_URL` sees the server look up the team's deposits and, later, its relayed withdrawals: by transaction, or by the payout's one-time address when the relayer didn't confirm one. A node run by someone else can link the two by the server's IP address. Run your own node if the team pool matters to you.

Timing and amounts give the most away. A deposit of 250 USDC followed an hour later by a 250 USDC payout is easy to match, whatever the cryptography says. Deposit well ahead, in round amounts larger than any one bounty, and let several payouts come out of one deposit at different times. A pool with more deposits from other people hides the team better; a quiet pool hides less.

## How the server protects data

- Session, invite, share-link and access-key tokens are random, and only their SHA-256 hashes are stored. A leaked database can't be used to sign in.
- A signed-in browser alone can't add a way back in. Linking another wallet or making an access key needs a fresh signature from a wallet already linked to the account. Access keys expire after at most `ACCESS_KEY_MAX_DAYS` (365). A sign-in reset revokes them, and **Sign out on all devices** offers to.
- Sign-in challenges aren't kept in a list on the server that others could fill up. Each one comes back signed by the server for the network that asked for it, and works once.
- Session cookies are `HttpOnly` and `SameSite=Lax`. Over HTTPS they are also `Secure` and use the `__Host-` prefix.
- Every change needs a custom header and a same-origin check, which blocks cross-site request forgery. The live connection and the MCP endpoint check the origin too.
- The server sends a strict Content Security Policy with no inline or outside scripts, plus `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, cross-origin opener and resource policies, a restrictive `Permissions-Policy` that still lets the site itself use passkeys, and HSTS over HTTPS.
- Sign-in, bounty applications, ballots, AI and other sensitive requests are rate-limited. Limits by address count an IPv6 /64 as one client and also cap each /56 and /48.
- Uploads get random names and owner-only file permissions. Only images and PDFs display in the browser; everything else downloads, so an uploaded HTML file can never run. Encrypted files are only ever served as opaque downloads in a sandbox, and once decrypted, only images other than SVG, PDFs, audio, video and plain text keep their type, so a decrypted file can't run as a page of Nil either.
- SQLite's `secure_delete` is on, so deleted rows are overwritten in the database file, and erasing anything also clears the write-ahead log. Trash is erased after 30 days by default and read notifications after 90 days.
- Receipts are signed with a key kept outside the database, in `DATA_DIR/keys`.
- CSV exports neutralise spreadsheet formulas.

## Honest limits

- Nothing is audited. No part of Nil's own code, including how it uses cryptography and smart contracts, has had an independent security audit. Privacy Pools itself was audited (circuits, contracts and the entry contract upgrade by Oxorio, contracts by Auditware); Nil's use of it wasn't.
- A payout from the team's pool is never announced on-chain, since the announcement would come from a team wallet. The contributor finds it through Nil, so if the server's data is lost before they move it, they need the payout's key, which **Key** shows, to reach it.
- An admin who once opened the team's pool key still knows it after they stop being an admin, and could spend what the pool holds. If that matters, take every deposit back with a ragequit, then **Start over with a new key**.
- Encrypted weighted votes are in beta. The ballot circuit (`circuits/ballot.circom`) hasn't been audited. Its Groth16 setup uses the Perpetual Powers of Tau for phase 1, but phase 2, recorded in `circuits/CEREMONY.json`, was a development ceremony with every contribution made on one machine. Whoever ran it could in principle forge proofs. Rerun phase 2 with independent contributors before relying on these votes for anything that matters; [the ballot ceremony](../circuits/CEREMONY.md) in the source code shows how.
- In an encrypted vote, two trustees working together could decrypt single ballots. That reveals each ballot's choice and weight, but not who cast it. An unusual weight can still point to a person.
- The server decides who is in a vote's census and which ballots the trustees of an encrypted vote decrypt. Browsers check what they can: voters compare the voter list they fetch without a cookie with the one they were shown signed in, and trustees check every ballot and add them up themselves. A dishonest server could still show everyone the same made-up list, or hand trustees only some of the ballots, down to a single one, whose "totals" would then be that ballot.
- Anonymous votes hide who voted what among the members who voted. In a small team, or with a lopsided result, the totals alone can give choices away.
- Anonymous ballots, and the voter list fetched just before them, carry no cookie, but the server and any proxy still see the IP address and time each one arrives. Use Tor if that matters. If your keys aren't unlocked when you vote, unlocking them sends signed-in requests just before your ballot.
- Anonymous AI requests hide which member asked only among the members with a voting key, which in a small team is a handful of people. The server and Anthropic still read each request in full, and its words and the time it arrives can point to the person who sent it. So can its IP address, unless they use Tor. A dishonest server could also hand one person a member list of its own making and recognise their requests by it. [AI assistants](ai-assistants.md#what-anonymous-requests-dont-hide) has the details.
- A [public vote](votes.md#public-votes) shows anyone with its link every ballot's wallet, choice and voting power, and the wallets that make up a member's ballot in its audit file.
- A signed vote with public ballots shows every member each ballot's member, wallet address and choice, and in a weighted vote their power. Any member can download its audit file then, which in a weighted vote also lists each voter's wallets at the snapshot.
- Signed votes are not secret from admins: the audit file lists each ballot's wallet address and choice, and in a weighted vote the voter's wallets at the snapshot, which shows they belong together.
- Files on team tasks aren't encrypted, and an encrypted file still shows its size.
- Someone taken out of a shared folder keeps whatever they downloaded or previewed. Files keep their own keys when the folder gets a new one, so if they kept a file's key and the server hands them its encrypted copy, they can still read that file, and the name it's given later. Taking them out stops them fetching anything from Nil and keeps every file added afterwards from them.
- Photos lose their hidden details before they're uploaded only when they're JPEG, PNG or WebP. GIF, HEIC, AVIF, TIFF and every other format are uploaded with whatever details they hold, and so are documents, whose own metadata Nil never touches.
- Previews decrypt the whole file into the browser tab, as do downloads in browsers that can't write a file to disk a piece at a time. Like everything else you unlock, it's readable there until the tab lets go of it. Reminder notes and time entry notes are stored in plain form, though only their owner sees them in the app.
- Making a private task visible to the team again sends its words and files back to the server in plain form. The files go up just before the switch; if the switch doesn't go through, those plain copies are deleted, at the latest within the hour.
- Encryption only helps if the app your browser runs is Nil's own code. Whoever runs the server could serve changed code that reads everything you unlock. Anyone can [check what a server sends](verify-a-server.md) against a release, byte for byte, but that proves what the server sent to the check, not to everyone at every moment. Running a build you trust on a server you control is the strongest defence.
- The server decides which wallets belong to whom, and your browser can't check that. The first key your browser sees for a teammate could come from the server, so compare fingerprints before you rely on it. A new browser or device starts over, and so does a workspace or account your browser hasn't used before. Nil warns when your browser already holds teammates' keys for another one, and locks your keys if the server switches an open tab to a different workspace or account.
- Private tasks, docs, comments and files saved before Nil signed who they're for open marked as the older format. Until they're saved again, Nil doesn't share them with anyone on its own, and that save takes who they're for from the server.
- A wallet opens your keys with its signature, so it has to give the same signature for the same message every time. A wallet that doesn't can still sign you in but can't hold your keys; Nil checks each wallet when it's added to your keys. Smart wallets, including passkey wallets, can't hold or publish encryption keys yet. A passkey you add under Encryption keys can unlock keys a regular wallet set up, but it can't publish them.
- A passkey unlocks your keys without your wallet, so it is only as safe as the device or passkey manager that holds it. Nil asks for user verification each time, such as a fingerprint or device PIN.
- A passkey belongs to the web address it was made on. If the workspace moves to a new address, passkeys stop opening your keys there. That's why Nil never lets a passkey be your only way back: a wallet must hold your keys too, or you must have downloaded a recovery kit.
- If you lose every wallet that holds your keys and have no recovery kit or working passkey, your keys are gone. You start over with new keys, and docs and private tasks sealed to the old ones have to be shared with you again. Private payouts sent to the old keys stay out of reach.
- A server can send an older saved version of a doc or a private task. Every save carries a signed revision number, so a browser that has already opened a newer one shows a warning. A browser or device that has never opened it has nothing to compare with, and the older version is still its writer's real text.
- Keys, and the docs and private tasks opened with them, live in the browser tab while it's open, until you lock your keys or sign out. Anything that can read that tab's memory, such as a malicious browser extension, could read them.
- Never lose `DATA_DIR/keys`. The signing key there signs every receipt, and every message that unlocks or publishes encryption keys names the workspace by it. Without it, the workspace gets a new identity: earlier proofs no longer match the key it publishes, no wallet opens anyone's encryption keys, and Nil won't restore recovery kits made for the old key. Everyone starts over with new keys. Back it up with the database.
- If you lose every wallet linked to your account, only an admin's sign-in reset gets you back in. Link a second one.
- An admin can reset a member's sign-in, and whoever opens that link signs in as the member. Resetting an owner needs a second admin who has been one for at least 72 hours, or, with nobody to approve, waits 72 hours while the owner and the other admins are told and can cancel it. Every reset is in the sign-in history. The link doesn't open the member's encryption keys. Whoever uses it needs the member's recovery kit and its passphrase, or has to set up new keys, which teammates see as a changed key.
- The token-holder door checks wallets, not tokens. One stack of NOX keeps one person in, but someone who moves it to fresh wallets can still join as new people one after another. Each of those accounts is signed out once its grace period runs out.
- Receipts prove what the workspace said, not that the workspace is honest. See [Proof of work](proof-of-work.md).
- Without Nil's verifier, or with it in shadow mode, the server believes its Ethereum node: a lying or compromised node could make it credit a payment that never happened or count holdings nobody has. Shadow mode tells admins afterwards. In enforce mode a node can no longer fake an answer, but it can still leave one out, so it can hide or hold back a payment. The verifier is built on Helios, which is unaudited; it trusts the checkpoint it starts from (refusing one older than two weeks) and can't prove blocks older than about 27 hours.
- Memory-only mode still writes to disk if the host swaps memory. Turn swap off or encrypt it.
- The server runs as one process with SQLite. Live updates and rate limits are kept in memory, so run a single instance.
- There is no dark mode.

To report a security problem, follow [SECURITY.md](../SECURITY.md) in the source code.
