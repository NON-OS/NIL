# Privacy model

This page lists what Nil protects and what it doesn't. It covers who can see what inside a workspace, what the person running the server can read, and what leaves the server.

## Inside the workspace

- Private tasks are shown only to their creator and their assignee. Admins don't see them.
- Your timesheet, your reminders and your My Day list are yours alone.
- Docs are shown only to the people they're shared with.
- Wallet addresses, last-seen times, private payout addresses and voting-key commitments are shown only to admins and to the person themselves. Teammates see the name each person picked.
- Bounty payments are shown only to admins and to the person paid, because a transaction reveals the receiving wallet.
- Guests see only the projects shared with them and the tasks assigned to them.
- In an anonymous vote, nobody, admins included, can see who chose what.

## What the server operator can read

Some things are encrypted in your browser with keys the server never has:

- [encrypted docs](encrypted-docs.md), titles included,
- the title, notes, checklist and comments of [private tasks](private-tasks.md),
- the ballots of [encrypted weighted votes](votes.md#encrypted-weighted-votes-beta).

Everything else is stored in plain form in the server's database, where anyone with access to the server or its backups can read it:

- team tasks, their comments and their history,
- uploaded files, including those on team tasks,
- goals, projects and labels,
- time entries, reminders and their notes,
- the list of people, their names, roles and wallet addresses,
- bounty amounts and payment records,
- signed votes, with each voter's wallet and choice.

For a private task, the server still knows that it exists, who created it, who it's assigned to, its status, dates, project, labels and the other fields listed in [Private tasks](private-tasks.md#what-is-encrypted-and-what-isnt). For a doc, it knows who can read it, who changed it and when.

## What leaves your server

Your browser loads nothing from other hosts. Nil has no analytics, trackers, CDNs, third-party fonts or third-party scripts. The fonts and the zero-knowledge circuit files are served by your own server. The Content Security Policy only allows connections to the server itself, so the app can't contact another host. Block-explorer links open only when you click them. Your wallet extension makes its own network requests, which Nil doesn't control.

The server itself contacts other hosts in two cases:

- Its Ethereum node, set by `NOX_RPC_URL`, to check payments, balances, stakes and Zero-State Passes, and to pass on the transactions you sign when you move a private payout. That node sees which addresses and transactions your server looks up, and your server's IP address. The default is a public node. Privacy-minded teams should run their own. `NOX_RPC_URL=off` turns every on-chain feature off.
- Anthropic, only when the operator set `ANTHROPIC_API_KEY` and only when someone clicks an AI button. Each feature sends only the text it needs. See [AI assistants](ai-assistants.md#built-in-ai).

If you connect your own AI assistant over MCP, the assistant fetches from Nil, and whatever it reads goes on to that assistant's provider.

## What is public on purpose

- On-chain payments are public, like any Ethereum transaction. [Private payouts](private-payouts.md) hide which person a payout belongs to, but the payer, the token, the amount and the time are still visible. Moving funds from a one-time address to a wallet people know links them.
- Without signing in, anyone can see the workspace name, whether the token-holder door is open and its minimum, the public proof key, the [public bounty board](public-bounty-board.md) and any share link they hold.

## How the server protects data

- Session, invite, share-link and access-key tokens are random, and only their SHA-256 hashes are stored. A leaked database can't be used to sign in.
- Session cookies are `HttpOnly` and `SameSite=Lax`. Over HTTPS they are also `Secure` and use the `__Host-` prefix.
- Every change needs a custom header and a same-origin check, which blocks cross-site request forgery. The live connection and the MCP endpoint check the origin too.
- The server sends a strict Content Security Policy with no inline or outside scripts, plus `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, cross-origin opener and resource policies, a restrictive `Permissions-Policy`, and HSTS over HTTPS.
- Sign-in, bounty applications, ballots, AI and other sensitive requests are rate-limited.
- Uploads get random names and owner-only file permissions. Only images and PDFs display in the browser; everything else downloads, so an uploaded HTML file can never run.
- SQLite's `secure_delete` is on, so deleted rows are overwritten in the database file. Trash is erased after 30 days by default and read notifications after 90 days.
- Receipts are signed with a key kept outside the database, in `DATA_DIR/keys`.
- CSV exports neutralise spreadsheet formulas.

## Honest limits

- Nothing is audited. No part of Nil's own code, including how it uses cryptography and smart contracts, has had an independent security audit.
- Encrypted weighted votes are in beta. The ballot circuit (`circuits/ballot.circom`) hasn't been audited. Its Groth16 setup uses the Perpetual Powers of Tau for phase 1, but phase 2, recorded in `circuits/CEREMONY.json`, was a development ceremony with every contribution made on one machine. Whoever ran it could in principle forge proofs. Rerun phase 2 with independent contributors (see `scripts/zk-ballot.mjs`) before relying on these votes for anything that matters.
- In an encrypted vote, two trustees working together could decrypt single ballots. That reveals each ballot's choice and weight, but not who cast it. An unusual weight can still point to a person.
- Anonymous votes hide who voted what among the members who voted. In a small team, or with a lopsided result, the totals alone can give choices away.
- Anonymous ballots carry no cookie, but the server and any proxy still see the IP address and time each ballot arrives. Use Tor if that matters.
- Signed votes are not secret from admins: the audit file lists each ballot's wallet address and choice.
- Files aren't encrypted, so private tasks can't hold them yet. Reminder notes and time entry notes are stored in plain form too, though only their owner sees them in the app.
- Encryption keys come from wallet signatures. A wallet that signs the same message differently each time can't use encrypted docs, private tasks, private payouts or anonymous votes. Nil checks this the first time.
- Keys live in the browser tab while it's open. Anything that can read that tab's memory, such as a malicious browser extension, could read them.
- Never lose `DATA_DIR/keys`. The signing key there signs every receipt and is part of every person's key derivation. Without it, the workspace gets a new identity: earlier proofs no longer match the key it publishes, and nobody can derive their encryption, private payout or voting keys again. Back it up with the database.
- If you lose every wallet linked to your account, you lose the account. Link a second one.
- Receipts prove what the workspace said, not that the workspace is honest. See [Proof of work](proof-of-work.md).
- Memory-only mode still writes to disk if the host swaps memory. Turn swap off or encrypt it.
- The server runs as one process with SQLite. Live updates and rate limits are kept in memory, so run a single instance.
- There is no dark mode.

To report a security problem, follow [SECURITY.md](../SECURITY.md) in the source code.
