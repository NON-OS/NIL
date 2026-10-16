# Nil

Nil is the private task app for you and your team, made by the NØNOS foundation. You sign in with an Ethereum wallet, run it on your own server, and your private tasks and docs are encrypted in the browser before they reach it.

Besides tasks, Nil has bounties paid in NOX or USDC and checked on-chain, signed and anonymous votes, and signed proof of work. This is version 3.0.0; see [CHANGELOG.md](CHANGELOG.md) for what changed. No part of Nil's own code has had an independent security audit, and encrypted weighted votes are in beta. The [privacy model](docs/privacy-model.md) explains what that means.

## Quick start

You need a browser with an Ethereum wallet extension, or a wallet's in-app browser, to sign in.

With Docker (Compose v2.24 or newer):

```bash
git clone <your-nonos-repo-url> nonos
cd nonos
cp .env.example .env        # APP_URL starts as http://localhost:3000 for trying it here
docker compose up -d --build
```

Open `http://localhost:3000`, connect your wallet and create the workspace with the one-time setup token from the log (`docker compose logs nonos | grep 'setup token'`). You become the owner.

With plain Node (22.13 or newer):

```bash
npm ci
npm run build
cp .env.example .env
node --env-file=.env --disable-warning=ExperimentalWarning server/index.js
```

For development, run `npm install` and `APP_URL=http://localhost:5173 npm run dev`, then open `http://localhost:5173`.

For a public server with HTTPS, follow [Production deployment](docs/deploy.md). Every setting is explained in [.env.example](.env.example).

## Documentation

The full documentation is in [docs/](docs/README.md). The same pages are in the app under **Help**.

| Area | Pages |
|---|---|
| Start here | [Getting started](docs/getting-started.md), [Signing in](docs/signing-in.md), [People and roles](docs/people-and-roles.md) |
| Everyday work | [Tasks](docs/tasks.md), [Views and finding things](docs/views.md), [Time and reminders](docs/time-and-reminders.md), [Goals, insights and decks](docs/goals-and-insights.md), [Keyboard shortcuts](docs/keyboard-shortcuts.md) |
| Privacy and encryption | [Private tasks](docs/private-tasks.md), [Encrypted docs](docs/encrypted-docs.md), [Privacy model](docs/privacy-model.md), [Zero-state](docs/zero-state.md) |
| Money and decisions | [Bounties and payouts](docs/bounties-and-payouts.md), [Private payouts](docs/private-payouts.md), [Public bounty board](docs/public-bounty-board.md), [Votes](docs/votes.md), [NOX, voting power and Nil Pro](docs/nox-and-nil-pro.md), [Proof of work](docs/proof-of-work.md) |
| Sharing and AI | [Sharing and guests](docs/sharing-and-guests.md), [AI assistants](docs/ai-assistants.md) |
| Your data and your server | [Backups and moving](docs/backups-and-moving.md), [Self-hosting](docs/self-hosting.md), [Production deployment](docs/deploy.md), [Tor onion service](docs/tor.md), [Development](docs/development.md) |
| Reference | [Proof file format](docs/proof-format.md), [FAQ](docs/faq.md), [Glossary](docs/glossary.md) |

To report a vulnerability, see [SECURITY.md](SECURITY.md). To contribute, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

Nil is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. If you run a modified version for others over a network, offer them its source (set `SOURCE_URL`). See [LICENSE](LICENSE).

The Nil and NØNOS names and logos are not covered by the licence. See [TRADEMARKS.md](TRADEMARKS.md).
