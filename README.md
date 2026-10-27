# Nil

Nil is the private task app for you and your team, made by the NØNOS foundation. You sign in with an Ethereum wallet, run it on your own server, and your private tasks and docs are encrypted in the browser before they reach it.

Teammates can call each other, alone or a few at a time, with sound, video and screens that go browser to browser, encrypted end to end and checked against the keys they confirmed; nothing is recorded. Besides tasks, Nil has bounties paid in NOX or USDC and checked on-chain, signed and anonymous votes, and signed proof of work. Running it yourself is free. The NØNOS foundation also hosts Nil, where Nil Pro is paid in USDC or in NOX for less, and NOX holders get perks; [NOX, voting power and Nil Pro](docs/nox-and-nil-pro.md) explains how NOX fits in. This is version 3.0.0; see [CHANGELOG.md](CHANGELOG.md) for what changed. No part of Nil's own code has had an independent security audit, and encrypted weighted votes are in beta. The [privacy model](docs/privacy-model.md) explains what that means.

## Quick start

You need a browser with an Ethereum wallet extension, or a wallet's in-app browser, to sign in.

With Docker (Compose v2.24 or newer):

```bash
git clone https://github.com/NON-OS/NIL-.git nonos
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
| Everyday work | [Tasks](docs/tasks.md), [Views and finding things](docs/views.md), [Time and reminders](docs/time-and-reminders.md), [Goals, insights and decks](docs/goals-and-insights.md), [Calls](docs/calls.md), [Keyboard shortcuts](docs/keyboard-shortcuts.md) |
| Privacy and encryption | [Private tasks](docs/private-tasks.md), [Encrypted docs](docs/encrypted-docs.md), [Privacy model](docs/privacy-model.md), [Encryption and trust](docs/encryption.md), [Zero-state](docs/zero-state.md), [Check what a server sends](docs/verify-a-server.md) |
| Money and decisions | [Bounties and payouts](docs/bounties-and-payouts.md), [Private payouts](docs/private-payouts.md), [Public bounty board](docs/public-bounty-board.md), [Votes](docs/votes.md), [NOX, voting power and Nil Pro](docs/nox-and-nil-pro.md), [Proof of work](docs/proof-of-work.md) |
| Sharing and AI | [Sharing and guests](docs/sharing-and-guests.md), [AI assistants](docs/ai-assistants.md), [AI agents](docs/ai-agents.md) |
| Your data and your server | [Backups and moving](docs/backups-and-moving.md), [Self-hosting](docs/self-hosting.md), [Hosted Nil](docs/hosted.md), [Production deployment](docs/deploy.md), [Tor onion service](docs/tor.md), [Development](docs/development.md) |
| Reference | [Proof file format](docs/proof-format.md), [Formal verification](docs/formal-verification.md), [FAQ](docs/faq.md), [Glossary](docs/glossary.md) |

To report a vulnerability, see [SECURITY.md](SECURITY.md). To contribute, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

Nil's source is available under the Business Source License 1.1. You may read, audit, build and test it, and check that a running server matches a release, but running it in production, hosting it for others or offering a fork as a service needs a license from NØNOS: write to ops@nonos.app. Four years after each version is published, that version becomes available under the GNU Affero General Public License v3 or later. See [LICENSE](LICENSE). Third-party components keep their own licences; see [NOTICE.md](NOTICE.md).

The Nil and NØNOS names and logos are not covered by the licence. See [TRADEMARKS.md](TRADEMARKS.md).
