# Privacy model

This page lists what Nil protects and what it doesn't. It covers who can see what inside a workspace, what the person running the server can read, and what leaves the server.

## Inside the workspace

- Private tasks are shown only to their creator and their assignee. Admins don't see them.
- Your timesheet, your reminders and your My Day list are yours alone.
- Docs are shown only to the people they're shared with.
- Wallet addresses, last-seen times, private payout addresses and voting-key commitments are shown only to admins and to the person themselves. Teammates see the name each person picked. The one exception is the wallet that signed your encryption keys: members see its address next to your key fingerprint, so they can check the key. To show a different one, add another wallet to your keys, remove the wallet that signed, and unlock again: Nil then asks the wallet you're using to sign your keys.
- Bounty payments are shown only to admins and to the person paid, because a transaction reveals the receiving wallet.
- Guests see only the projects shared with them and the tasks assigned to them.
- In an anonymous vote, nobody, admins included, can see who chose what.
- The audit file of a sealed vote, which lists every ballot, is ready only once the vote closes.

## What the server operator can read

Some things are encrypted in your browser with keys the server never has:

- [encrypted docs](encrypted-docs.md), titles included,
- the title, notes, checklist, comments and files of [private tasks](private-tasks.md), file names and types included,
- the ballots of [encrypted weighted votes](votes.md#encrypted-weighted-votes-beta).

Everything else is stored in plain form in the server's database, where anyone with access to the server or its backups can read it:

- team tasks, their comments and their history,
- files on team tasks, with their names,
- the size of every file, including encrypted ones, to within a few bytes,
- goals, projects and labels,
- time entries, reminders and their notes,
- the list of people, their names, roles and wallet addresses,
- bounty amounts and payment records,
- signed votes, with each voter's wallet and choice.

For a private task, the server still knows that it exists, who created it, who it's assigned to, its status, dates, project, labels and the other fields listed in [Private tasks](private-tasks.md#what-is-encrypted-and-what-isnt). For a doc, it knows who can read it, who changed it and when.

The server also hands out everyone's public keys. Teammates' browsers check those keys and the signatures on what each person writes. Once you've compared fingerprints with someone, the server can't swap their key or change their words without your browser noticing. [Encryption and trust](encryption.md) explains the checks and what an operator could still do.

## What leaves your server

Your browser loads nothing from other hosts. Nil has no analytics, trackers, CDNs, third-party fonts or third-party scripts. The fonts and the zero-knowledge circuit files are served by your own server. The Content Security Policy only allows connections to the server itself, so the app can't contact another host. Block-explorer links open only when you click them. Your wallet extension makes its own network requests, which Nil doesn't control.

The server itself contacts other hosts in these cases:

- Its Ethereum node, set by `NOX_RPC_URL`, to check payments, balances, stakes and Zero-State Passes, and to pass on the transactions you sign when you move a private payout. That node sees which addresses and transactions your server looks up, and your server's IP address. A server people reach over the network has to name one; only a server on localhost falls back to a public node. Privacy-minded teams should run their own. `NOX_RPC_URL=off` turns every on-chain feature off.
- Anthropic, only when the operator set `ANTHROPIC_API_KEY` and only when someone clicks an AI button. Each feature sends only the text it needs. See [AI assistants](ai-assistants.md#built-in-ai).
- The push service of a browser maker (Google, Apple, Mozilla or Microsoft), only for people who turned on push notifications on a device. Each notification is encrypted for that device, so the push service sees only that one arrived, when, and from which server. The server posts only to the hosts in `PUSH_SERVICES`, and `PUSH_NOTIFICATIONS=off` stops it altogether. See [Time and reminders](time-and-reminders.md#push-notifications).

If you connect your own AI assistant over MCP, the assistant fetches from Nil, and whatever it reads goes on to that assistant's provider.

## What is public on purpose

- On-chain payments are public, like any Ethereum transaction. [Private payouts](private-payouts.md) hide which person a payout belongs to, but the payer, the token, the amount and the time are still visible. Moving funds from a one-time address to a wallet people know links them.
- Without signing in, anyone can see the workspace name, whether the token-holder door is open and its minimum, the public proof key, the [public bounty board](public-bounty-board.md), any share link they hold, and the tasks in any [calendar feed](views.md#your-tasks-in-your-own-calendar-app) link they hold.

## How the server protects data

- Session, invite, share-link and access-key tokens are random, and only their SHA-256 hashes are stored. A leaked database can't be used to sign in.
- Session cookies are `HttpOnly` and `SameSite=Lax`. Over HTTPS they are also `Secure` and use the `__Host-` prefix.
- Every change needs a custom header and a same-origin check, which blocks cross-site request forgery. The live connection and the MCP endpoint check the origin too.
- The server sends a strict Content Security Policy with no inline or outside scripts, plus `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, cross-origin opener and resource policies, a restrictive `Permissions-Policy`, and HSTS over HTTPS.
- Sign-in, bounty applications, ballots, AI and other sensitive requests are rate-limited.
- Uploads get random names and owner-only file permissions. Only images and PDFs display in the browser; everything else downloads, so an uploaded HTML file can never run.
- SQLite's `secure_delete` is on, so deleted rows are overwritten in the database file, and erasing anything also clears the write-ahead log. Trash is erased after 30 days by default and read notifications after 90 days.
- Receipts are signed with a key kept outside the database, in `DATA_DIR/keys`.
- CSV exports neutralise spreadsheet formulas.

## Honest limits

- Nothing is audited. No part of Nil's own code, including how it uses cryptography and smart contracts, has had an independent security audit.
- Encrypted weighted votes are in beta. The ballot circuit (`circuits/ballot.circom`) hasn't been audited. Its Groth16 setup uses the Perpetual Powers of Tau for phase 1, but phase 2, recorded in `circuits/CEREMONY.json`, was a development ceremony with every contribution made on one machine. Whoever ran it could in principle forge proofs. Rerun phase 2 with independent contributors before relying on these votes for anything that matters; [the ballot ceremony](../circuits/CEREMONY.md) in the source code shows how.
- In an encrypted vote, two trustees working together could decrypt single ballots. That reveals each ballot's choice and weight, but not who cast it. An unusual weight can still point to a person.
- The server decides who is in a vote's census and which ballots the trustees of an encrypted vote decrypt. Browsers check what they can: voters compare the voter list they fetch without a cookie with the one they were shown signed in, and trustees check every ballot and add them up themselves. A dishonest server could still show everyone the same made-up list, or hand trustees only some of the ballots, down to a single one, whose "totals" would then be that ballot.
- Anonymous votes hide who voted what among the members who voted. In a small team, or with a lopsided result, the totals alone can give choices away.
- Anonymous ballots, and the voter list fetched just before them, carry no cookie, but the server and any proxy still see the IP address and time each one arrives. Use Tor if that matters. If your keys aren't unlocked when you vote, unlocking them sends signed-in requests just before your ballot.
- Signed votes are not secret from admins: the audit file lists each ballot's wallet address and choice, and in a weighted vote the voter's wallets at the snapshot, which shows they belong together.
- Files on team tasks aren't encrypted, and an encrypted file still shows its size. Reminder notes and time entry notes are stored in plain form, though only their owner sees them in the app.
- Making a private task visible to the team again sends its words and files back to the server in plain form. The files go up just before the switch; if the switch doesn't go through, those plain copies are deleted, at the latest within the hour.
- Encryption only helps if the app your browser runs is Nil's own code. Whoever runs the server could serve changed code that reads everything you unlock. Anyone can [check what a server sends](verify-a-server.md) against a release, byte for byte, but that proves what the server sent to the check, not to everyone at every moment. Running a build you trust on a server you control is the strongest defence.
- The server decides which wallets belong to whom, and your browser can't check that. The first key your browser sees for a teammate could come from the server, so compare fingerprints before you rely on it. A new browser or device starts over.
- A wallet opens your keys with its signature, so it has to give the same signature for the same message every time. A wallet that doesn't can still sign you in but can't hold your keys; Nil checks each wallet when it's added to your keys. Smart wallets, including passkey wallets, can't hold or publish encryption keys yet.
- If you lose every wallet that holds your keys and have no recovery kit, your keys are gone. You start over with new keys, and docs and private tasks sealed to the old ones have to be shared with you again. Private payouts sent to the old keys stay out of reach.
- A server can send an older saved version of a doc or a private task. Every save carries a signed revision number, so a browser that has already opened a newer one shows a warning. A browser or device that has never opened it has nothing to compare with, and the older version is still its writer's real text.
- Keys live in the browser tab while it's open. Anything that can read that tab's memory, such as a malicious browser extension, could read them.
- Never lose `DATA_DIR/keys`. The signing key there signs every receipt, and every message that unlocks or publishes encryption keys names the workspace by it. Without it, the workspace gets a new identity: earlier proofs no longer match the key it publishes, no wallet opens anyone's encryption keys, and Nil won't restore recovery kits made for the old key. Everyone starts over with new keys. Back it up with the database.
- If you lose every wallet linked to your account, only an admin's sign-in reset gets you back in. Link a second one.
- An admin can reset a member's sign-in, and whoever opens that link signs in as the member. Resetting an owner needs a second admin when there is one, and every reset is in the sign-in history. The link doesn't open the member's encryption keys. Whoever uses it needs the member's recovery kit and its passphrase, or has to set up new keys, which teammates see as a changed key.
- Receipts prove what the workspace said, not that the workspace is honest. See [Proof of work](proof-of-work.md).
- Memory-only mode still writes to disk if the host swaps memory. Turn swap off or encrypt it.
- The server runs as one process with SQLite. Live updates and rate limits are kept in memory, so run a single instance.
- There is no dark mode.

To report a security problem, follow [SECURITY.md](../SECURITY.md) in the source code.
