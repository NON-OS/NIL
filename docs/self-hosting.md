# Self-hosting

Nil is free software that you run on your own server. A server with 2 CPU cores and 2 GB of memory is a comfortable start for a team of a few dozen people, though these are starting points rather than measured limits. This page gets a copy running and explains the settings that matter. For a public server with HTTPS, backups and a launch checklist, follow [Production deployment](deploy.md).

Everyone who signs in needs a browser with an Ethereum wallet extension, or a wallet's in-app browser.

## With Docker

You need Docker with Compose v2.24 or newer.

```bash
git clone <your-nonos-repo-url> nonos
cd nonos
cp .env.example .env        # optional: edit settings
docker compose up -d --build
```

Open `http://localhost:3000`, connect your wallet and create the workspace. You become the owner. The database, uploaded files and the signing key live in the `nonos-data` volume.

The container runs as an unprivileged user with a read-only root filesystem, no Linux capabilities and `no-new-privileges`. Only `/data` and `/tmp` are writable.

## With plain Node

You need Node.js 22.13 or newer, because Nil uses the built-in `node:sqlite`.

```bash
npm ci
npm run build
cp .env.example .env        # edit as needed
node --env-file=.env --disable-warning=ExperimentalWarning server/index.js
```

`npm start` doesn't read `.env` by itself. Either use `--env-file` as above or export the variables in your shell. Data goes to `./data` unless you set `DATA_DIR`.

## For development

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The API runs on port 3000 and restarts when the code changes; the web app reloads by itself. See [Development](development.md) for the other commands.

## Settings

Every setting is an environment variable, and every one is optional. An empty value counts as unset, so the default applies. `.env.example` in the source code lists them all, grouped and explained. These matter most:

| Variable | Default | What it does |
|---|---|---|
| `APP_URL` | none | Your public address, like `https://nonos.example.com`. Used in sign-in messages, origin checks and the bounty feed |
| `TRUST_PROXY` | off | Set to `1` behind a reverse proxy. Needed for secure cookies and correct visitor addresses |
| `DATA_DIR` | `./data` (`/data` in Docker) | Database, uploads and the signing key |
| `SOURCE_URL` | none | A link to your source code, shown in the app. The AGPL asks you to offer it if you run a modified version for others |
| `NOX_RPC_URL` | a public node | The Ethereum node to use, or `off` to turn on-chain features off |
| `REWARD_TOKENS` | USDC on mainnet | Extra bounty tokens, as `SYMBOL:address:decimals`, or `none` for NOX only |
| `PLAN_TREASURY` | none | Set only to charge workspaces for Nil Pro in NOX. Unset means community mode |
| `ANTHROPIC_API_KEY` | none | Turns on built-in AI |

Other groups in `.env.example` cover sessions and uploads (`SESSION_DAYS`, `TRASH_DAYS`, `MAX_UPLOAD_MB`, `MAX_CAPSULE_MB`), sign-in (`SIGNIN_CHAIN_TIMEOUT_SECONDS`, `SIGNIN_RESET_HOURS`), the token and network (`NOX_TOKEN`, `NOX_CHAIN_ID`, `NOX_CONFIRMATIONS`, `NOX_EXPLORER`), the paid plan (`PLAN_PRICE`, `PLAN_PERIOD_DAYS`, `PLAN_GRACE_DAYS`, `PLAN_FREE_SEATS`, `PLAN_TRIAL_DAYS`), private payouts, voting power and anonymous votes.

A setting that is set but can't be used, such as a malformed number or treasury address, is named in a line starting with `[config]` in the startup log. The line says what the server does instead: use the default, or stay in community mode.

## Choices to make

### Your Ethereum node

The server checks payments, balances, stakes and passes through `NOX_RPC_URL`. The default public node sees every address and transaction your server looks up, and your server's IP address. Use your own node, or a provider you trust, for privacy. The server refuses a node on a different network from `NOX_CHAIN_ID`.

### Charging or not

Leave `PLAN_TREASURY` unset to run in community mode, with every tool unlocked. Set it only if you run Nil for others and want them to pay you in NOX. See [NOX, voting power and Nil Pro](nox-and-nil-pro.md).

### Built-in AI

With `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN`) set, text goes to Anthropic only when someone clicks an AI button. Leave it unset and no task data ever goes there. Connecting your own assistant over MCP works either way. See [AI assistants](ai-assistants.md).

### Tor and memory-only mode

Nil can run as a Tor onion service; see [Tor onion service](tor.md). It can also keep its data in memory only, so nothing is written to disk; see [Zero-state](zero-state.md#memory-only-mode).

## Running it well

- Run exactly one copy. Nil uses SQLite and keeps live updates and rate limits in memory, so it can't run behind a load balancer with several replicas.
- Back up the data folder, and above all `DATA_DIR/keys`. See [Backups and moving](backups-and-moving.md).
- Read the changelog before you upgrade. Database migrations run on start and only go forward.
