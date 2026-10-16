# Changelog

All notable changes to Nil, the task app made by NØNOS, are listed here, newest first. Versions up to 3.0.0 were released under the NØNOS name.

## Unreleased

### Breaking changes

- **`APP_URL` is required.** The server refuses to start without it. Wallet sign-in messages and the origin check use it, plus `ALLOWED_ORIGINS`, and never the Host, Origin or X-Forwarded-Host headers. Plain http is accepted only for localhost and .onion addresses. With `npm run dev`, set `APP_URL=http://localhost:5173`. Onion-only servers set it to their .onion address: [docs/TOR.md](docs/TOR.md) shows the two-step first start.
- **`NOX_RPC_URL` is required on a server people reach over the network.** There is no public default any more, because a public node sees every address the server looks up. Set your own node, a provider you trust, or `off`. A server whose `APP_URL` is a localhost address still falls back to a public node, with a startup warning.
- **`TRUST_PROXY` no longer accepts `true`.** Give the proxy's address or subnet (`uniquelocal` for Caddy in the same Compose project, `loopback` for a proxy on the same machine) or a hop count. A value it can't use is ignored with a warning.
- `docker-compose.tor.yml` removes Nil's published port, so an onion-only server no longer answers on its normal IP address.

### Security and privacy

- A phishing site could ask for a sign-in message naming its own domain when `APP_URL` was empty, pass the wallet's domain check and relay the signature to sign in as someone else. Requiring `APP_URL` closes this.
- Guests no longer hear about tasks they can't open. Notifications, mentions, watchers, vote notices, presence and the timesheet export all check who can open the task. Whoever loses access to a task (made private, reassigned, moved out of a guest's projects, a project unshared or deleted) also loses their watch, its notifications and its My Day entry.
- Anonymous ballots are held until the hour they arrived in has ended, then counted together in random order and stored with the hour only, so neither the live count nor the database shows when a ballot came in. Voting keys are registered when a member first unlocks their keys or clicks **Join anonymous votes**, never together with a ballot, and only their owner sees them. The audit file lists ballots by nullifier with hour stamps, and existing ballot and voter-tree times are rounded to the hour (migration 024).
- Signing out closes the live connection that session opened, and live connections close once their session expires or is revoked. Over HTTPS only the `__Host-` session cookie is read, so a cookie planted by a sibling subdomain signs nobody in.
- Pending sign-in challenges are capped per client as well as overall, so one client can't push out everyone else's sign-in. Rate limits and challenges count an IPv6 /64 as one client.
- Private payout balances are read from the Ethereum node one address at a time, at random moments within `STEALTH_BALANCE_SPREAD_SECONDS`, with another payee's address mixed in, and listing payouts no longer calls the node. Vote snapshots read wallets in a shuffled order, a few at a time.
- Wiping the workspace, purging, erasing a person or task, deleting a comment and sealing a task now also clear SQLite's write-ahead log, so deleted text doesn't linger in `nonos.db-wal`.
- Bounty totals leave out private tasks the viewer can't open, admins included.
- The AI draft and deck dialogs say that the text passes through the Nil server on its way to Anthropic. The README lists what the server still knows about a private task.
- `image-size`, which pptxgenjs declares but never loads, is pinned to 2.0.4, past its denial-of-service fixes.

### Added

- **Private tasks are end-to-end encrypted.** A private task's title, notes, checklist and comments are sealed in the browser with a key only its creator and assignee hold (X25519 key wrapping and AES-256-GCM, the same scheme as docs). The server stores ciphertext and refuses plain text for a private task. Reassigning one seals it under a fresh key and re-encrypts its comments. Private tasks from before this change are sealed the next time their creator or assignee unlocks, and the plain copies the server kept (old titles in the history, notification previews, receipt titles) are wiped. The new-task box has a Private switch, so a private task is encrypted from its first save.
- **Files on private tasks are encrypted too.** Each file gets its own random key and is encrypted in the browser with AES-256-GCM, its name and type included, and that key is wrapped under the task's key. The server stores ciphertext under a generic name, serves it only as a download, refuses plain uploads to a private task and keeps file names out of its history. Reassigning a private task re-wraps the file keys only, never the files. Making a task with files private encrypts each one in the browser and swaps it in with the task, all or nothing, and opening a task up does the reverse. Migration 018 adds the column that holds each file's sealed details.
- AI assistants can't create private tasks and see encrypted ones only as placeholders.
- A help center inside the app, at `/help`. It shows the pages in `docs/`, bundled at build time, with a topic list and a search over titles and text. It opens from the question mark next to your name in the sidebar, from the account menu, from search (including "Search help for" with whatever you typed) and from the keyboard shortcuts dialog. Signed out, it's a public page linked from the sign-in screen. Small question-mark links next to private tasks, the Nil Pro notice, votes, docs, bounties, private payouts, AI settings, proof of work and data settings open the matching page.
- Markdown in task descriptions, comments and docs can now contain tables.
- **A setup token guards a fresh server.** Creating the first workspace, or restoring a capsule into an empty server, needs a one-time token: `SETUP_TOKEN`, or one the server makes at first start, prints once in the log and keeps in `DATA_DIR/setup-token`. The setup and restore screens ask for it. It stops working once a workspace exists, and erasing the workspace makes a new one.
- **Clean shutdown.** On SIGTERM or Ctrl+C the server stops its jobs, tells open tabs to reconnect (WebSocket close code 1001), lets requests in progress finish, waits for running jobs and closes the database, then exits 0. If that takes longer than `SHUTDOWN_TIMEOUT_SECONDS` (20) it exits with an error. `docker-compose.yml` allows 30 seconds.
- **`/healthz` checks the database** and answers 503 when it doesn't respond. It reports the version, the schema, when each job last succeeded and failed, and whether the Ethereum node answered the last time it was asked, and nothing about the workspace.
- **A copy of the database before every upgrade.** Before applying migrations, the server saves `pre-migration-<time>-schema-<n>.db` in the data folder with `VACUUM INTO` and keeps the newest three. Erasing the workspace deletes them too.
- `STRICT_CONFIG=1` refuses to start while any `[config]` warning remains. `LOG_FORMAT=json` writes one JSON object per log line.
- Settings for values that were fixed in code, with the old values as defaults: `NOX_RPC_TIMEOUT_SECONDS`, `NOX_MISSING_TX_HOURS` (bounty payments), `MAX_JSON_KB`, `NOTIFICATION_DAYS`, `USED_INVITE_DAYS`, `JOB_PURGE_SECONDS`, `JOB_PAYMENTS_SECONDS`, `JOB_VOTES_SECONDS`, `JOB_REMINDERS_SECONDS`, and new ones for `JOB_OPTIMIZE_SECONDS`, `DB_JOURNAL_LIMIT_MB`, `AI_TIMEOUT_SECONDS` and `AI_MAX_RETRIES`. All are in `.env.example`.
- Migration 019 adds indexes for the hourly purge (comments, activity and read notifications by date) and for tasks by creator. SQLite's `PRAGMA optimize` runs hourly, and the write-ahead log is cut back to 64 MB after checkpoints.
- Continuous integration (`.github/workflows/ci.yml`): tests, type check, build, `npm audit --omit=dev`, a Docker build that boots the image and checks `/healthz`, and an upgrade of a 3.0.0 database (`server/test/fixtures/v3.0.0.db`) to the latest schema.
- **A tab notices a new deploy.** The server tells open tabs which build it serves, and a tab running an older one shows "A new version of Nil is ready" with a Reload button. A tab that asks for a screen whose files a deploy removed reloads once by itself. An error no screen handles now shows a plain page with a Reload button instead of a blank one. Nothing about the error leaves the browser.

### Changed

- **Big workspaces start fast.** The app starts with open work and recent history as cards: title, status, dates, labels and checklist progress. Notes and checklists load when a task is opened. Finished tasks nobody has touched in 30 days stay on the server until a view needs them: All tasks and project lists have a Load older button, the calendar fetches finished tasks due in the month on screen, Insights and status decks load the weeks they cover, and search looks through them too. Goal and project progress still counts every finished task, and a finished task with an unpaid bounty always loads. `RECENT_CLOSED_DAYS` (30) and `RECENT_CLOSED_MAX` (1000) set how much history comes up front. On a test workspace of 20,000 tasks, the first load went from 30 MB and 0.9 s of server time to 3.5 MB and 0.14 s.
- A private task starts as its encrypted title and checklist; its encrypted notes arrive when it's opened.
- Tabs reconnecting after a server restart spread their refresh over a few seconds instead of all asking at once.
- **Smaller app download.** Settings, Docs, Votes, Bounties, Proof of work, Verify, Insights, Calendar, Goals, Time, sign-in and the public pages load the first time they're opened, and the cryptography for private tasks and payouts loads on first unlock. The code needed to start went from 612 kB to 414 kB (193 kB to 130 kB compressed). Libraries sit in files of their own that stay cached, so most deploys only change a 184 kB file.
- The Caddyfile in `docs/DEPLOY.md` compresses responses with `encode zstd gzip`. Add that line to yours.
- API: `GET /api/bootstrap?tasks=cards` returns task cards and an `archive` section, and `GET /api/tasks/archive` and `/api/tasks/archive/summary` page through older finished tasks. Plain `GET /api/bootstrap` still returns every task in full, for tabs opened before this release and for scripts. Every task now carries `steps`, its checklist progress.
- Live updates are encoded once for everyone who gets the same one, instead of once per open tab.

- **The app is now called Nil.** NØNOS stays as the name of the foundation behind it. The app shows the Nil lockup (the official Ø mark with letters drawn from the same Geist cut as the NØNOS wordmark, see `scripts/brand/nil-wordmark.py`), and its title, install name, sign-in page and messages say Nil. The paid plan is called Nil Pro. Messages your wallet signs to derive keys are unchanged, so every existing key still works.
- New workspaces start with an empty name instead of NØNOS.
- The documentation is split into short pages in `docs/`, one topic each, with `docs/README.md` as the index. The README is now a short front page. `docs/DEPLOY.md`, `docs/TOR.md`, `docs/PROOFS.md` and `docs/ZERO-STATE.md` became `docs/deploy.md`, `docs/tor.md`, `docs/proof-format.md` and `docs/zero-state.md`.
- The Docker build copies `docs/`, which the in-app help is built from.
- **`docker-compose.yml` publishes port 3000 on 127.0.0.1 only.** Put Caddy or another TLS proxy in front, as `docs/deploy.md` describes. It also limits the container to 1 GB of memory (2 GB in memory-only mode, whose data lives in RAM) and rotates its logs.
- The Docker image is pinned to Node 22.23.3 on Alpine 3.24 by digest, carries OCI labels with the version, and its health check follows `PORT`.
- Log lines carry a timestamp and a level. Configured secrets are cut out of every line, and request bodies, cookies and headers are never logged. The startup line shows the version and `APP_URL`.
- Stricter settings checks. `NOX_TOKEN`, `REWARD_TOKENS`, `STEALTH_ANNOUNCER`, `NOX_STAKING`, `ZSP_CONTRACT` and `PLAN_TREASURY` must be valid addresses, with a correct EIP-55 checksum when they mix upper and lower case; a bad one is named in a warning instead of being dropped quietly. With `NOX_CHAIN_ID` other than 1, the contracts have to be named, since the defaults are mainnet contracts. `NOX_CONFIRMATIONS` is at least 1. In production the server warns about an empty `APP_URL`, an https `APP_URL` without `TRUST_PROXY`, and the default public Ethereum node.
- An AI request gives up after 120 seconds and is retried once, instead of the SDK's default ten minutes and two retries.
- The server refuses to start on a database written by a newer release, and says so, instead of running against a schema it doesn't know. A capsule from a newer release is refused the same way.

### Fixed

- A long hint in a menu could squeeze the item's label to nothing. Hints now give way and trail off first.
- A background job that failed, for example on "database is locked" or a full disk, could take the whole server down. Every job now logs its failure (at most once every ten minutes while it keeps failing) and runs again on schedule. Errors in the live-update connection are caught the same way, and an error nothing else handles stops the server cleanly instead of abruptly.
- Payment checks that failed were dropped without a word. They are logged now, rate-limited.
- A missing file under `/assets/` got the app's HTML with status 200. It is a plain 404 now.
- A capsule export kept encrypting after the browser cancelled the download. It stops now, and its plaintext database snapshot is always deleted.
- After a deploy, the service worker could store the app's page in place of a script that no longer existed, which broke that screen until the browser's cache was cleared. It now stores only real build files. While the server restarts, an installed app opens from its stored copy instead of an error page.

## 3.0.0 (2026-10-15)

Version 3 makes the Ethereum wallet the only way in and adds NOX token utility: bounties paid on-chain, private payouts, token-weighted and anonymous votes, and an optional NOX subscription. It also adds encrypted docs, everyday tools, sharing, an MCP connection for AI assistants and PowerPoint decks.

### Breaking changes

- **Wallet-only sign-in.** Email, passwords and passkeys are gone. Sign-In with Ethereum is the only way in. Migration 004 rebuilds the users table without email or password columns and deletes every non-wallet sign-in method. Before upgrading from v2, every person must link an Ethereum wallet. See [docs/deploy.md](docs/deploy.md#11-upgrades).
- **Light interface only.** Dark mode is removed.

### Added

**Bounties and payouts**

- Bounties on tasks, paid by an admin's own wallet straight to the contributor. The server only reads the chain: it checks the token contract, sender, receiver and amount after enough confirmations, then signs a payment receipt that joins the contributor's proof of work. Pending payments are re-checked every minute.
- A Bounties page: open bounties, amounts promised, owed and paid per person and token, payment history and treasury addresses (for example a Safe multisig) that may also pay.
- Bounties in NOX or USDC. Each task carries its reward token, payments are checked against that token's contract, and totals, receipts, decks, notifications and MCP output show each token separately. `REWARD_TOKENS` configures the list. NOX is always first and USDC on mainnet is the default extra.
- Private payouts to ERC-5564 stealth addresses. Stealth keys come from one deterministic wallet signature and live only in the browser tab. Each payout goes to a fresh one-time address, is announced on the standard announcer and carries a small ETH top-up for gas, in one atomic EIP-5792 batch where the wallet supports it. The server confirms the payout reached the payee's stealth address. Payees can see balances, move funds from the browser or export the key. Derivation matches the ERC-5564 reference SDK on pinned test vectors.
- A public bounty board at `/open`, also published as `/.well-known/nonos-bounties.json`. Outsiders apply by signing a message with their wallet, with no account or email. Accepted applicants become guests who see only their task.

**Votes and membership**

- Votes signed by the voter's wallet, counted one per person or by voting power. Results can be sealed until the vote closes. Admins can download a recount file.
- A token-holder door: admins can let anyone holding a minimum of NOX join as a member. For people who joined that way, the balance is checked again at every sign-in.
- Voting power = NOX in linked wallets + NOX staked in the official staking contract + Zero-State Passes × a power per ZSP that admins set (`VOTE_ZSP_POWER` is the default). It is read for every member at one block when a weighted vote opens, so tokens moved during the vote can't count twice and people who join later have no power in it. The recount file carries the block, the contracts and every member's breakdown.
- Anonymous votes with Semaphore zero-knowledge proofs. Each member's voting key is derived from a wallet signature, and only its public commitment reaches the server. Ballots are proven in the browser from circuit files the server hosts, sent without the session cookie, and limited to one per member per vote. The recount file holds every root and proof but no names. `npm run zk:fetch` downloads circuit files for other tree depths and keeps them only if they pass hash and proof checks.
- **Beta:** encrypted weighted anonymous votes with three trustees. A new circuit (`circuits/ballot.circom`, 30,669 constraints) proves the voter is in the vote's census with their snapshotted power and encrypts that power into the chosen option with exponential ElGamal on Baby Jubjub. Trustees run a distributed key generation, so nobody holds the private key. After the vote closes, any two trustees decrypt only the totals, with Chaum-Pedersen proofs. The circuit has not been audited, and its Groth16 phase 2, recorded in `circuits/CEREMONY.json`, is a development ceremony run on one machine. It must be rerun with independent contributors before these votes are relied on. `npm run zk:ballot` rebuilds the circuit and setup.

**Subscription**

- An optional NOX subscription. A workspace pays NOX from an admin's wallet or a treasury address to the operator's treasury, and the server adds one period per full price after checking the transfer on-chain. Nothing is charged automatically.
- Paid tools: new bounties and public listings, opening new votes, the token-holder door, built-in AI, the MCP connection, and teams beyond the free seats. Reading, exporting, paying bounties already promised and finishing votes already opened (ballots, closing and trustee decryption) are never gated.
- A free trial counted from workspace setup, a grace period after a lapse, and community mode (everything unlocked) when `PLAN_TREASURY` is not set.
- **Settings → Plan**: status, price, seats, paying 30 to 360 days from a wallet or by pasting a multisig transaction, and payment history.

**Everyday work**

- Private tasks, visible only to their creator and assignee, not even to admins.
- Personal time tracking with a timer, a private timesheet and CSV export.
- Reminders that arrive as notifications.
- An installable progressive web app. Its service worker never caches API data.

**Docs, sharing and AI**

- End-to-end encrypted docs. Keys are derived in the browser from a deterministic wallet signature over a message that names the workspace by its signing key, so renaming the workspace doesn't change anyone's keys. Private payout and voting keys work the same way. Every doc has its own AES-256-GCM key sealed per reader. The server stores only ciphertext, keeps 25 encrypted revisions, refuses stale saves and re-keys a doc when a reader is removed. Online teammates hand team docs to newcomers automatically.
- Project guests, member invites (when admins allow them) and read-only share links. Share links are off until an admin enables them, stored as hashes, expiring and revocable, and show no people, comments, files, addresses or private tasks.
- An MCP endpoint at `/mcp` for AI assistants, authenticated by personal access keys that are shown once, stored as hashes, scoped read or read-write, expiring and revocable. Eight tools run through the same visibility rules as the app.
- Draft with AI in docs, with a plain notice of what leaves the browser.
- One-click PowerPoint status decks for the workspace, a project or a goal, built in the browser, with speaker notes. With AI on, Claude can write the summary and notes from the facts on the slides.

**Other**

- The official NØNOS brand: logo, mark and icons, Geist and JetBrains Mono, and motion that turns off under reduced motion.
- `marketing/video`: a kit that renders marketing videos in code. It is not part of the app or the Docker image.

### Changed

- Tests are split into identity, tasks and data suites, with new suites for bounties, holders, votes, anonymous and encrypted votes, docs, sharing, plan, stealth payouts and MCP.
- Polish to the bounty field, the timesheet layout and list rows on phones.
- The Content Security Policy adds `'wasm-unsafe-eval'` so the browser can run the zero-knowledge prover. It still allows no JavaScript `eval` and no other hosts.
- Settings: an empty value counts as unset everywhere, so the default applies. A number, `PLAN_TREASURY`, `PLAN_PRICE` or `NOX_EXPLORER` that can't be used is named in a startup warning instead of silently changing how the server behaves.
- Block-explorer links on the proof verifier use `NOX_EXPLORER`.

### Security

- Patched security advisories in express, ws and vite. Transitive ws, snarkjs and underscore are pinned to patched versions.
- Docker builds leave out local data folders, databases, capsules, exports, `.env` files and keys wherever they sit in the tree, and the Dockerfile removes any that slip into the server folder before the runtime image is assembled.

### Known limits

- No part of NØNOS's own code has had an independent security audit.
- Encrypted weighted votes are beta, for the reasons above.
- See [Honest limits](docs/privacy-model.md#honest-limits) in the privacy model.

## Earlier versions

Version 2 added passkeys and wallet sign-in, proof of contribution receipts, encrypted capsules and zero-state controls. Version 1 was the first release of the team task system. See the git history for details.
