# Changelog

All notable changes to Nil, the task app made by NØNOS, are listed here, newest first. Versions up to 3.0.0 were released under the NØNOS name.

## Unreleased

### Added

- **Private tasks are end-to-end encrypted.** A private task's title, notes, checklist and comments are sealed in the browser with a key only its creator and assignee hold (X25519 key wrapping and AES-256-GCM, the same scheme as docs). The server stores ciphertext and refuses plain text for a private task. Reassigning one seals it under a fresh key and re-encrypts its comments. Private tasks from before this change are sealed the next time their creator or assignee unlocks, and the plain copies the server kept (old titles in the history, notification previews, receipt titles) are wiped. The new-task box has a Private switch, so a private task is encrypted from its first save.
- AI assistants can't create private tasks and see encrypted ones only as placeholders. Files can't be attached to private tasks until files are encrypted too.
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

### Fixed

- A long hint in a menu could squeeze the item's label to nothing. Hints now give way and trail off first.
- After a deploy, the service worker could store the app's page in place of a script that no longer existed, which broke that screen until the browser's cache was cleared. It now stores only real build files, and the server answers a missing build file with a 404. While the server restarts, an installed app opens from its stored copy instead of an error page.

## 3.0.0 (2026-10-15)

Version 3 makes the Ethereum wallet the only way in and adds NOX token utility: bounties paid on-chain, private payouts, token-weighted and anonymous votes, and an optional NOX subscription. It also adds encrypted docs, everyday tools, sharing, an MCP connection for AI assistants and PowerPoint decks.

### Breaking changes

- **Wallet-only sign-in.** Email, passwords and passkeys are gone. Sign-In with Ethereum is the only way in. Migration 004 rebuilds the users table without email or password columns and deletes every non-wallet sign-in method. Before upgrading from v2, every person must link an Ethereum wallet. See [docs/DEPLOY.md](docs/DEPLOY.md#11-upgrades).
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
- See [Honest limits](README.md#honest-limits) in the README.

## Earlier versions

Version 2 added passkeys and wallet sign-in, proof of contribution receipts, encrypted capsules and zero-state controls. Version 1 was the first release of the team task system. See the git history for details.
