# Nil

Nil is the private task app for you and your team, made by NØNOS. It covers tasks, end-to-end encrypted docs, bounties paid in crypto, votes and signed proof of work. You run it on your own server. People sign in with an Ethereum wallet and nothing else: no email, no password.

Nil uses the NOX token on Ethereum. Bounties are paid in NOX or USDC, voting power comes from NOX held, NOX staked and Zero-State Pass NFTs, and Nil Pro, paid in NOX, unlocks the paid tools on servers that charge for them.

This is version 3.0.0. See [CHANGELOG.md](CHANGELOG.md) for what changed.

Free software under the [GNU AGPL v3 or later](LICENSE).

> **Status.** No part of Nil's own code has had an independent security audit. Encrypted weighted votes are in beta (see [Honest limits](#honest-limits)).

## Contents

- [What it does](#what-it-does)
- [Privacy model](#privacy-model)
- [How NOX fits in](#how-nox-fits-in)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Honest limits](#honest-limits)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Development](#development)
- [Documentation](#documentation)
- [Licence](#licence)

## What it does

### Sign-in and people

- **Wallet-only sign-in.** Sign-In with Ethereum (EIP-4361). The server writes the message, your wallet signs it, and the server checks the signature. Nonces are single-use and expire after 5 minutes. It works with injected browser wallets (MetaMask, Rabby, Coinbase Wallet, Brave and others) or a wallet's own in-app browser.
- **More than one wallet.** Link extra wallets in **Settings → Sign-in & security**. You can't remove your last wallet, because it is your only way in.
- **Roles.** Owner, admin, member and guest. The first wallet to set up a fresh server becomes the owner.
- **Invites.** Admins create invite links (valid 1 to 30 days) for admins, members or guests. Admins can also let members invite members and guests. Links are stored only as hashes.
- **Token-holder door.** Admins can let anyone holding at least a set amount of NOX join as a member without an invite. For people who joined this way, the balance is checked again at every sign-in. An admin can let a holder stay without the check.

### Everyday work

- **My work.** Everything assigned to you, grouped into new, overdue, today, the next 7 days, later and no due date. Plus a private **My Day** focus list.
- **Board.** Kanban columns from Backlog to Done. Drag cards with a mouse, touch or the keyboard.
- **All tasks.** A grouped, sortable list. Select many tasks and change status, priority, assignee, project, due date or labels at once.
- **Calendar.** A month view. Drag tasks to reschedule them.
- **Goals.** Outcomes with a number to track. Link tasks to a goal and watch progress add up.
- **Insights.** Tasks finished per week, open work per person, project and goal progress, overdue work and typical time to done.
- **Projects.** Each project has its own board and list, a lead, a colour and a short key.
- **Tasks.** Status, priority, assignee, due and start dates, labels, estimates, checklists, Markdown descriptions, file attachments, comments with @mentions and a full history.
- **Recurring tasks.** Daily, weekdays, weekly, every two weeks or monthly. Finishing one creates the next. If you finished late, the next due date skips forward past today.
- **Private tasks, end-to-end encrypted.** Only the creator and the assignee can see a private task. Admins can't. Its title, notes, checklist and comments are encrypted in the browser under a key that only those two people hold, so the server stores scrambled text and nothing else. Giving the task to someone new seals it under a fresh key. For everyone else, private tasks are left out of lists, live updates, presence, activity, exports and the AI brief. Files can't be attached to a private task yet, because files aren't encrypted.
- **Time tracking.** A timer on any task and a timesheet you can export as CSV. Your time log is visible only to you.
- **Reminders.** Set a reminder on a task or with a note. It arrives as a notification, and as a desktop notification if you turned those on.
- **Inbox.** Notifications for assignments, @mentions, comments on tasks you follow, status changes, new votes and bounty applications.
- **Live updates.** Changes appear for everyone at once. You can see who is online, who is looking at the same task and who is typing.
- **Quick add.** For example, `Send investor update friday !high +GE @me every week` sets the due date, priority, project, assignee and repeat schedule in one line.
- **Command palette and shortcuts.** `⌘K` / `Ctrl+K` jumps to any task, project or page. Press `?` for every shortcut.
- **Installable app.** Nil is a progressive web app. Install it on a phone or desktop. Its service worker caches only the app's own files, never data from the API.

### End-to-end encrypted docs

- Each person's encryption key (X25519) is derived in the browser from a wallet signature. It never leaves the tab.
- Every doc has its own AES-256-GCM key, sealed separately for each reader. The server stores only ciphertext and sealed keys.
- A doc is shared with the whole team or with chosen people. Removing someone gives the doc a new key, so they can't read later versions.
- The last 25 versions are kept, encrypted. A save based on an old version is refused instead of overwriting someone else's work.
- When a new teammate unlocks docs, a teammate who is online hands them the team docs automatically.
- Docs are for members. Guests don't get them.
- The first unlock signs twice to make sure your wallet signs the same way each time. A wallet that doesn't can't hold an encryption key.

### Bounties and payouts

- **Bounties in NOX or USDC.** Admins put a reward on a task. The list of reward tokens is configurable (`REWARD_TOKENS`). NOX is always first.
- **Paid wallet to wallet.** The admin's own wallet sends the tokens to the contributor's first linked wallet. Nil never holds funds. The server only reads the chain.
- **Checked on-chain.** A payment counts only when the right token contract moved at least the full amount from an allowed payer to the right address, after enough confirmations (3 by default). Pending payments are re-checked every minute.
- **Treasury addresses.** Besides admins' own wallets, up to 10 extra addresses (for example a Safe multisig) can pay. Paste the transaction hash to record a payment made elsewhere.
- **Payment receipts.** A confirmed payment gets a signed receipt that joins the contributor's proof of work. It names the transaction, the token, the amount and the address that received the payment.
- **Bounties page.** Open bounties, amounts promised, owed and paid per person and token, and payment history. Members see only their own rows.
- **Private payouts (ERC-5564 stealth addresses).** A contributor can turn on private payouts. Their stealth keys come from one wallet signature and live only in the browser tab. The server stores only the public meta-address, shown to admins and the owner of the keys. Each payout goes to a fresh one-time address, is announced on the standard ERC-5564 announcer, and comes with a small ETH top-up for gas (0.0003 ETH by default). The server checks the payout really reached the payee's stealth address. Payees can see each payout's balance, move it from the browser (the server relays only transactions signed by their own one-time addresses) or export the key into any wallet.
- **Public bounty board.** Admins can list a bounty on `/open`. The same list is published at `/.well-known/nonos-bounties.json` for anyone to index. A listing shows the title, the first 600 characters of the description, the reward, the due date and the number of applicants. Outsiders apply by signing a message with their wallet: no account and no email. Accepting an applicant makes them a guest who sees only that task. Listings drop off when the task is assigned, made private or finished.

### Votes

There are three kinds of vote. Admins create them, with 2 to 8 options and a length of 1 to 60 days.

- **Signed votes.** Each ballot is signed by one of the voter's linked wallets. A vote counts one per person or by voting power. Results can stay hidden until the vote closes. The app shows each person only their own choice. Admins can download a recount file (the **Audit file** button) with every signed ballot, and that file lists each ballot's wallet address and choice. Use an anonymous vote when choices must stay secret from admins.
- **Anonymous votes (Semaphore).** Each member's voting key is a Semaphore identity derived from a wallet signature. Only its public commitment reaches the server. Ballots are zero-knowledge proofs made in the browser and sent without the session cookie, after a short random delay. One ballot per member per vote, which they can change. Each ballot counts once, without weight. The recount file holds the voter group, every accepted root and every proof, but no names.
- **Encrypted weighted votes (beta).** Anonymous ballots weighted by voting power. Each ballot encrypts the voter's power into the chosen option, with a Groth16 proof (NØNOS's own circuit, `circuits/ballot.circom`) that the power is the voter's real snapshotted power and the option is real. Three trustees, chosen by the admin, set up a shared key. The server adds up the encrypted ballots. After the vote closes, any two trustees decrypt only the totals, each with a proof that they used their real share. A wrong partial decryption is caught, and one trustee alone learns nothing. Trustees must be members who have unlocked encrypted docs. This feature is beta: the circuit has not been audited, and its trusted setup is a development ceremony (see [Honest limits](#honest-limits)).

### Proof of contribution

- Every finished task gets a receipt signed with the workspace's Ed25519 key. Receipts are hash-chained, so edits and reordering show.
- Task titles are salted commitments. Contributors choose which receipts go into a proof file and which titles to reveal. A work receipt shows the contributor's wallet address only if they opt in. A payment receipt always shows the address that received the payment, which the transaction makes public anyway (for a private payout, the one-time address).
- Anyone can check a proof file at `/verify`, in the browser, without an account. The workspace publishes its public key at `/.well-known/nonos-proof-key`.
- The format is documented in [docs/PROOFS.md](docs/PROOFS.md).

### Sharing

- **Guests** see only the projects shared with them and tasks assigned to them. Workspace-wide features (docs, goals, votes, share links) are for members.
- **Share links** give a read-only view of one project or one task to anyone with the link, without signing in. They are off until an admin turns them on in **Settings → Team**. Links are stored as hashes, expire (1 to 365 days) and can be revoked. A project link shows task titles, status, priority and due dates. A task link adds the description, checklist progress and bounty. Neither shows people, comments, files, wallet addresses or private tasks.

### AI

- **Connect your own assistant (MCP).** Nil has a Model Context Protocol endpoint at `/mcp`. Claude or any MCP client connects with a personal access key that you create in **Settings → Connect AI**. Keys are shown once, stored as hashes, read-only or read-write, can expire and can be revoked. The assistant acts as you and sees exactly what you see. Other people's private tasks and encrypted docs are never reachable. Tools: `whoami`, `workspace_summary`, `list_tasks`, `get_task`, `list_projects`, `create_task`, `update_task`, `add_comment`.
- **Built-in AI (optional).** With an Anthropic API key on the server, Claude can break a task into steps, draft a description, turn meeting notes into tasks, write a weekly team brief, draft text in a doc and write the narrative for a status deck. It is off unless you set `ANTHROPIC_API_KEY`. Text goes to Anthropic only when someone clicks an AI button, and only what that feature needs.

### Status decks

- One click makes a PowerPoint (.pptx) for the workspace, a project or a goal over the last 7, 14 or 30 days. It has a cover, an overview, what shipped, what is in progress, an editable goals chart, risks, bounties and next steps, each with speaker notes.
- The deck is built in your browser. Private tasks stay out unless you choose to include them. With built-in AI on, Claude can write the summary and notes from only the facts on the slides.

### Your data

- **Encrypted capsules.** Admins download the whole workspace (database, uploaded files and the signing key) as one AES-256-GCM file locked with a passphrase. Restore it on any fresh server.
- **Exports.** A CSV of tasks for anyone, and a readable JSON backup for admins.
- **Zero-state controls.** Erase finished work, comments and history after a number of days you choose. An owner can erase the whole workspace. A memory-only mode keeps nothing on disk. See [docs/ZERO-STATE.md](docs/ZERO-STATE.md).
- **Tor.** Run Nil as an onion service with one extra compose file. See [docs/TOR.md](docs/TOR.md).

## Privacy model

What Nil protects, and what it doesn't.

**Who can see what inside the workspace**

- Wallet addresses, last-seen times, stealth meta-addresses and voting-key commitments are shown only to admins and to the person themselves.
- Private tasks are shown only to their creator and assignee. Admins don't see them either.
- Your timesheet and reminders are yours alone.
- Docs are end-to-end encrypted. The server and its operator see only ciphertext, plus who can read each doc and when it changed.
- In anonymous votes, ballots carry no session cookie and are matched to no account. Your browser recognises your own ballot by recomputing its nullifier.

**What the server operator can see**

- Docs, private tasks (title, notes, checklist, comments) and the contents of encrypted ballots are encrypted in the browser. Everything else is stored in plain form in the database: team tasks and their comments, files, goals, time entries, reminders and the list of who is in the workspace. Anyone with access to the server or its backups can read those. What the server still knows about a private task is that it exists, who created it, who it's assigned to, its status, dates, project and labels.

**What leaves your server**

- **The browser loads nothing from other hosts.** No analytics, no trackers, no CDNs, no third-party fonts or scripts. Fonts are bundled and the zero-knowledge circuit files are served by your server. The Content Security Policy sets `default-src 'self'` and `connect-src 'self'`, so the app can't contact another host. Block-explorer links open only when you click them. Your wallet extension makes its own network requests, outside Nil's control.
- **The Ethereum node.** The server reads the chain through `NOX_RPC_URL` to check payments, balances, stakes and passes. That node sees which addresses and transactions your server looks up, and your server's IP address. The default is a public node (`ethereum-rpc.publicnode.com`). Privacy-minded teams should point it at their own node. `NOX_RPC_URL=off` turns every on-chain feature off.
- **Anthropic**, only if you set `ANTHROPIC_API_KEY`, and only when someone uses an AI button. Draft with AI in a doc sends your instruction and, if you choose, the doc's text. That text is decrypted in your browser and leaves it for that request.
- **Your own AI assistant**, if you connect one over MCP. Whatever it reads goes to that assistant's provider.

**What is public on purpose**

- On-chain payments are public, like any Ethereum transaction. Private payouts hide which wallet a payout belongs to, but the payer, token, amount and time are still visible on-chain. Moving funds from a one-time address to a known wallet links them.
- Without signing in, anyone can see the workspace name, whether a token-holder door is open and its minimum, the public proof key, the public bounty board, and any share link they hold.

**How the server protects data**

- Session, invite, share-link and access-key tokens are random. Only their SHA-256 hashes are stored, so a leaked database can't be used to sign in.
- Session cookies are `HttpOnly` and `SameSite=Lax`. Over HTTPS they are also `Secure` and use the `__Host-` prefix, and only that cookie is accepted, so a cookie planted by a sibling subdomain signs nobody in. Signing out closes that session's live connection.
- Every write needs a custom header and an origin check against `APP_URL` (and `ALLOWED_ORIGINS`), which blocks cross-site request forgery. WebSockets and the MCP endpoint check the origin too. Wallet sign-in messages always name the configured domain, never one taken from the request, so a phishing site can't collect a signature that works here.
- Security headers: a strict CSP with no inline or external scripts, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, COOP and CORP, a restrictive `Permissions-Policy`, and HSTS over HTTPS.
- Sign-in, applications, ballots, AI and other sensitive endpoints are rate-limited.
- Uploads get random names and owner-only file permissions. Only images and PDFs display in the browser. Everything else downloads, so an uploaded HTML file can never run.
- SQLite `secure_delete` is on, so deleted rows are overwritten in the database file. Trash is purged after `TRASH_DAYS`, read notifications after 90 days.
- Receipts are signed with a key stored outside the database (`DATA_DIR/keys`).
- CSV exports neutralise spreadsheet formulas.

## How NOX fits in

NOX is an ERC-20 token on Ethereum. The token address, chain and decimals are set in `.env` (see [.env.example](.env.example)).

### Subscription (optional)

- With `PLAN_TREASURY` unset, the server runs in **community mode**: every tool is unlocked and nothing is charged. This is the default for self-hosting. The AGPL lets anyone run NØNOS this way.
- A server that sets `PLAN_TREASURY` (for example a hosted service) asks each workspace to pay in NOX:
  - A **free trial** runs from the day the workspace was set up (14 days by default).
  - An admin pays from **Settings → Plan**, from their own wallet or a treasury address, straight to the operator's treasury. Or pastes a transaction hash, for example from a multisig. The server reads the transfer on-chain and adds one period (30 days by default) for each full price paid (1000 NOX by default). Nothing is charged automatically.
  - After a lapse there is a **grace period** (7 days by default) before the paid tools pause.
- **Paid tools:** new bounties and public bounty listings, opening new votes, the token-holder door, built-in AI, the MCP connection, and teams larger than the free seat count (5 by default; guests never count).
- **Never paid:** tasks, projects, goals, encrypted docs, time tracking, reminders, share links, reading, exports, paying bounties already promised, and finishing votes already opened: casting ballots, closing them and the trustees' decryption of the totals.

### Bounties

Bounties are paid in NOX or in any token on the reward list. USDC on Ethereum mainnet is on the list by default. Each task carries its reward token. Payments are checked against that token's own contract, and totals, receipts, decks and notifications show each token separately.

### Voting power

In a vote weighted by voting power, each member's power is read for everyone at one block when the vote opens:

```
voting power = NOX in linked wallets + NOX staked in the staking contract + ZSPs held × power per ZSP
```

- Staked NOX is read from the official staking contract (`getStakeInfo`). Zero-State Passes are read from the ZSP contract.
- Admins set the power per ZSP in **Settings → Team → Voting power**. `VOTE_ZSP_POWER` is the default (100,000 NOX per ZSP).
- Tokens moved during the vote can't count twice, and people who join later have no power in that vote.
- Encrypted weighted votes count power in whole NOX. Members with less than 1 NOX of power can't take part in them.

### Token-holder door

Admins can open the workspace to anyone whose linked wallets hold a minimum amount of NOX. See [Sign-in and people](#sign-in-and-people).

## Quick start

You need a browser with an Ethereum wallet extension (or a wallet's in-app browser) to sign in.

### With Docker

Requires Docker with Compose v2.24 or newer.

```bash
git clone <your-nonos-repo-url> nonos
cd nonos
cp .env.example .env        # APP_URL starts as http://localhost:3000 for trying it here
docker compose up -d --build
```

Open http://localhost:3000, connect your wallet and create the workspace. You become the owner. The database, uploads and signing key live in the `nonos-data` volume.

For a public server with HTTPS, follow [docs/DEPLOY.md](docs/DEPLOY.md).

### With plain Node

Requires Node.js 22.13 or newer (Nil uses the built-in `node:sqlite`).

```bash
npm ci
npm run build
cp .env.example .env        # edit as needed
node --env-file=.env --disable-warning=ExperimentalWarning server/index.js
```

`npm start` does not read `.env` by itself. Either use `--env-file` as above or export the variables in your shell. Data goes to `./data` unless you set `DATA_DIR`.

### For development

```bash
npm install
APP_URL=http://localhost:5173 npm run dev
```

Open http://localhost:5173. `APP_URL` is required everywhere, because wallet sign-in messages name that domain. The API runs on port 3000 and restarts on changes. The web app reloads on changes.

## Configuration

All settings are environment variables. `APP_URL` is required, and so is `NOX_RPC_URL` on any server people reach over the network. Everything else is optional. [.env.example](.env.example) lists them all, grouped and explained. The ones that matter most:

| Variable | Default | What it does |
|---|---|---|
| `APP_URL` | required | The address people type, like `https://nonos.example.com`. Used in sign-in messages, origin checks and the bounty feed. Never read from request headers |
| `TRUST_PROXY` | off | The proxy's address range (`uniquelocal`, `loopback`, a subnet) or hop count, behind a reverse proxy. Needed for secure cookies and correct client IPs |
| `DATA_DIR` | `./data` (`/data` in Docker) | Database, uploads and signing key |
| `SOURCE_URL` | none | Link to your source code, shown in the app (the AGPL asks you to offer it) |
| `NOX_RPC_URL` | required (public node on localhost only) | Your Ethereum JSON-RPC node, or `off` to turn on-chain features off |
| `REWARD_TOKENS` | USDC on mainnet | Extra bounty tokens as `SYMBOL:address:decimals` |
| `PLAN_TREASURY` | none | Set only to charge a NOX subscription. Unset means community mode |
| `ANTHROPIC_API_KEY` | none | Turns on built-in AI |

## Honest limits

- **Nothing is audited.** No part of Nil's own code, including how it uses cryptography and smart contracts, has had an independent security audit.
- **Encrypted weighted votes are beta.** The ballot circuit (`circuits/ballot.circom`) has not been audited. Its Groth16 setup uses the Perpetual Powers of Tau for phase 1, but phase 2 (recorded in `circuits/CEREMONY.json`) was a development ceremony: all contributions ran on one machine. Whoever ran it could, in principle, forge proofs. Rerun phase 2 with independent contributors (see `scripts/zk-ballot.mjs`) before relying on these votes for anything that matters.
- **Trustees.** In an encrypted vote, two trustees acting together could decrypt individual ballots. That shows each ballot's choice and weight, but not who cast it. An unusual weight can still point to a person.
- **Small groups.** Anonymous votes hide who voted what among the members who voted. In a small team, or a lopsided result, totals alone can reveal choices.
- **Network metadata.** Anonymous ballots carry no cookie, but the server and any proxy still see the IP address and time each ballot arrives. Use Tor if that matters.
- **One server, one process.** The database is SQLite, live updates and rate limits are in memory. Run a single instance.
- **Wallets.** Sign-in needs an injected EIP-1193 wallet (a browser extension or a wallet's in-app browser). WalletConnect is not supported. Tor Browser ships without wallet extensions. If you lose every wallet linked to your account, you lose the account, so link a second one.
- **Deterministic signatures.** Encrypted docs, private payouts and anonymous voting derive keys from a wallet signature. Wallets that sign the same message differently each time can't use them. Nil checks this on first use.
- **Never lose `DATA_DIR/keys`.** The signing key there signs every receipt and is part of every person's key derivation. Without it, the workspace gets a new identity: earlier proofs no longer match the key it publishes, and nobody can re-derive their docs, private payout or voting keys. Back it up with the database. Renaming the workspace is safe: the messages people sign to derive those keys name the workspace by this key, not by its name.
- **Files aren't encrypted.** Docs and private tasks are; attachments are stored as uploaded, which is why private tasks can't hold them yet. Reminder notes and timer notes are stored in plain form too, and only their owner sees them. See [Privacy model](#privacy-model).
- **On-chain data is public**, and private payouts don't hide the payer, token, amount or timing.
- **The default Ethereum node is public** and sees what your server looks up. Use your own node for privacy.
- **Receipts prove what the workspace said,** not that the workspace is honest. See [docs/PROOFS.md](docs/PROOFS.md).
- **Memory-only mode** still lands on disk if the host swaps. Turn swap off or encrypt it.
- **Light interface only.** There is no dark mode.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `C` | New task |
| `⌘K` / `Ctrl+K` or `/` | Search and commands |
| `G` then `H` `I` `B` `L` `C` `D` `G` `S` `M` `N` `V` `P` `T` | My work, Inbox, Board, All tasks, Calendar, Docs, Goals, Insights, Time, Bounties, Votes, Proof of work, Settings |
| `X` | Select the focused task in a list |
| `Shift` click | Select a range |
| `⌘ Enter` | Send a comment or save a description |
| `?` | Show all shortcuts |

## Development

```bash
APP_URL=http://localhost:5173 npm run dev   # API on :3000 with auto-restart, web app on :5173 with hot reload
npm test            # API integration tests
npm run typecheck   # strict TypeScript for the web app
npm run build       # production bundle into dist/
npm run zk:fetch    # download Semaphore circuit files for SEMAPHORE_DEPTH (hash- and proof-checked)
npm run zk:ballot   # rebuild the encrypted-ballot circuit and rerun its setup (needs PTAU)
```

### Project layout

```
server/
  index.js        entry: migrate, start HTTP and WebSocket, schedule jobs
  app.js          Express app: security headers, /healthz, /.well-known, /mcp, /api, static files
  config.js       environment settings
  db/             SQLite connection, migrations, query helper
  auth/           wallet sign-in (SIWE), sessions, guards, plan check, rate limits
  security/       CSRF guard, origin check, security headers
  routes/         one router per resource
  services/       task logic, visibility, bounties, plan, voting power, sharing
  chain/          Ethereum JSON-RPC reads and raw transactions
  stealth/        ERC-5564 stealth address derivation
  votes/          Semaphore ballots, voter groups, encrypted ballots and trustee tally
  mcp/            Model Context Protocol endpoint and tools
  proofs/         receipt signing key, issuing, revocation
  capsules/       encrypted export and restore
  ai/             optional Claude-powered helpers
  jobs/           retention purge, payment checks, closing votes, reminders
  mappers/        database rows to API objects
  test/           integration tests
client/src/
  views/          one file per page
  components/     ui, task, drawer, docs, bounty, votes, plan, settings and more
  actions/        API calls and wallet flows grouped by domain
  lib/            dates, filters, quick-add parser, crypto, stealth, semaphore, decks
  state/          small store with optimistic updates
  realtime/       WebSocket client and event reducer
  types/          one type per file
client/public/zk/ circuit files served to browsers
circuits/         encrypted-ballot circuit and its setup record
scripts/          zk:fetch and zk:ballot
deploy/tor/       Tor onion service image
```

**Stack:** Node 22 (built-in SQLite), Express, ws, @noble/curves and @noble/hashes, snarkjs, Semaphore, @zk-kit/baby-jubjub, poseidon-lite, the Anthropic SDK (only used when AI is on), React 18, TypeScript, Vite, dnd-kit, lucide icons, pptxgenjs. Geist and JetBrains Mono fonts are bundled.

See [CONTRIBUTING.md](CONTRIBUTING.md) for house rules.

## Documentation

- [Production deployment](docs/DEPLOY.md)
- [All settings](.env.example)
- [Changelog](CHANGELOG.md)
- [Proof of Contribution format](docs/PROOFS.md)
- [Zero-state and memory-only mode](docs/ZERO-STATE.md)
- [Tor onion service](docs/TOR.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Licence

Nil is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. If you run a modified version for others over a network, offer them its source (set `SOURCE_URL`). See [LICENSE](LICENSE).
