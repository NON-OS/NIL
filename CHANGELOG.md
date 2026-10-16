# Changelog

All notable changes to Nil, the task app made by NØNOS, are listed here, newest first. Versions up to 3.0.0 were released under the NØNOS name.

## Unreleased

### Added

- **Private tasks are end-to-end encrypted.** A private task's title, notes, checklist and comments are sealed in the browser with a key only its creator and assignee hold (X25519 key wrapping and AES-256-GCM, the same scheme as docs). The server stores ciphertext and refuses plain text for a private task. Reassigning one seals it under a fresh key and re-encrypts its comments. Private tasks from before this change are sealed the next time their creator or assignee unlocks, and the plain copies the server kept (old titles in the history, notification previews, receipt titles) are wiped. The new-task box has a Private switch, so a private task is encrypted from its first save.
- AI assistants can't create private tasks and see encrypted ones only as placeholders. Files can't be attached to private tasks until files are encrypted too.
- **Everyday team or crypto team.** Setting up a workspace asks one question. An everyday team starts with bounties, votes, proof of work, private payouts and the token holder door hidden; a crypto team gets all of them. Admins can switch this in Settings, Workspace at any time, and nothing is deleted either way. With the tools off, their pages, menu entries and server routes are gone (the server answers 404), people go by name, and a wallet address shows only after a click on "Show wallet". The Nil Pro subscription works the same either way. Workspaces that existed before this keep their crypto tools on.
- **Getting started.** After setup, the owner's My work shows a short checklist: create a project, invite people, add a task with quick add, try a private task. Each step ticks itself when it happens, and the card can be dismissed. It also offers a sample project with a website launch, an offsite and a hiring round, which can be removed again in one click.
- **Reusable invite links.** Next to single-use links, admins can make a link several people can join through, with an expiry of 1, 7 or 30 days and an optional limit on how many. Links can be revoked, and admins see who joined through which link. Reusable links never make admins.
- **Search by words.** The command palette finds tasks by their notes, checklists and comments as well as their titles, and marks the matching words. Team tasks are searched on the server with SQLite full-text search, under the same visibility rules as the rest of the app. Private tasks and docs never go into that index: the browser searches the ones this tab has opened, in memory only.
- **Import from Todoist, Trello or a CSV file.** Settings, Data reads a Todoist project CSV, a Trello board JSON or any CSV with a header row in the browser, shows a preview, and lets you match its people and projects to this workspace. Tasks are then created a few at a time with progress, through the same calls the app uses everywhere. If you make them private, each one is encrypted in the browser from its first save.

### Changed

- **The app is now called Nil.** NØNOS stays as the name of the foundation behind it. The app shows the Nil lockup (the official Ø mark with letters drawn from the same Geist cut as the NØNOS wordmark, see `scripts/brand/nil-wordmark.py`), and its title, install name, sign-in page and messages say Nil. The paid plan is called Nil Pro. Messages your wallet signs to derive keys are unchanged, so every existing key still works.
- New workspaces start with an empty name instead of NØNOS.
- Migration 022 adds the crypto tools switch, invite use counts and the search index. Wiping the workspace and restoring a capsule now leave the index's own tables alone and rebuild it from the tasks.
- Unused invite links are still deleted as soon as they expire. Links someone joined through are kept for 30 days after they end, so admins can see who came in with them.

### Fixed

- A long hint in a menu could squeeze the item's label to nothing. Hints now give way and trail off first.
- A long explanation next to a switch in Settings could push the switch out of its card. The words wrap now.

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
