# Hosted Nil

The NØNOS foundation runs Nil for anyone who doesn't want to run their own server. You pick an address such as `yourteam.<hosted domain>`, sign a message with your wallet, and get a workspace of your own. Self-hosting stays free and works exactly as before; the operator's side of hosting is described in [cloud/README.md](../cloud/README.md).

## What you get

- Your own copy of Nil, in its own container with its own storage. Other teams' workspaces can't reach it, and it has no network access of its own except to the Ethereum node that checks payments.
- The free tier, with Nil Pro paid from inside your workspace (Settings → Plan), in USDC or NOX, straight to the NØNOS DAO treasury. Nothing is charged automatically.
- Nightly encrypted backups, updates and monitoring done for you.

## Getting started

1. On the sign-up page, choose your workspace's address and connect your wallet.
2. Sign the message your wallet shows. It names the address you chose. Signing is free and sends no transaction.
3. Copy the setup code the page shows you. It is shown once, and it is what proves the workspace is yours.
4. Open your workspace, enter the code, and create the workspace with the same wallet. You are its owner.
5. Link a second wallet and invite a second admin, so losing one wallet never locks you out.

A workspace nobody sets up within a week is removed, and its address becomes free again.

## What NØNOS can and cannot see

**Encrypted in your browser.** Docs (titles and text) and private tasks (title, notes, checklist and comments) are encrypted before they leave your browser, with keys that only you and the people you share with hold. NØNOS stores them and cannot read them. The same goes for the contents of encrypted votes and who cast an anonymous vote.

**Stored in plain form.** Everything else in your workspace is stored as written, in your workspace's own storage on NØNOS's server: team tasks and their comments, files, goals, projects, time entries, reminders, notifications, the activity history, and the member list with names, roles and linked wallet addresses. NØNOS doesn't look at any of it, and its tools never open your workspace's database. But it runs the server, so it could, and it could be ordered by a court to hand it over. Docs and private tasks would be handed over still encrypted.

**What NØNOS keeps about your workspace.** Its address, the wallet address that signed up, its state, app version and plan, when it was created, how much disk it uses, and whether its setup was finished. Not your members, not your tasks.

**Sign-up and web traffic.** The sign-up page sets no cookies, loads nothing from other sites and has no analytics. Your IP address is used for rate limits in memory and is never written down. The web server sees each request's IP address, as every web server does, and keeps no access log.

**Backups.** Backups are encrypted on the server with keys NØNOS keeps offline, then stored with a backup provider in another location, which sees only scrambled data. They contain what your workspace contains, so the plain-form data above is readable to NØNOS in a backup too. Backups are kept for 30 days.

**Payments.** Nil Pro payments are Ethereum transactions, public like any other.

## Leaving

You can leave at any time and take everything with you:

- Settings → Data & privacy → download an encrypted capsule (the whole workspace, locked with your passphrase). It restores into any self-hosted Nil server.
- Ask NØNOS to delete your workspace. It is stopped at once, kept for 14 days in case you change your mind, then erased. A last encrypted backup is taken when you ask, and expires 30 days after that like every other. The address stays reserved for 90 days, so nobody else can pick it up while your old links are still around.
