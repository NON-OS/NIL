# Development

This page is for people who change Nil's code. To run Nil for a team, see [Self-hosting](self-hosting.md).

## Commands

You need Node.js 22.13 or newer.

```bash
npm install
APP_URL=http://localhost:5173 npm run dev   # API on :3000 with auto-restart, web app on :5173 with hot reload
npm test            # API integration tests
npm run typecheck   # strict TypeScript for the web app
npm run build       # production bundle into dist/
npm run zk:fetch    # download Semaphore circuit files for SEMAPHORE_DEPTH (hash- and proof-checked)
npm run zk:ballot   # rebuild the encrypted-ballot circuit and rerun its setup (needs PTAU)
```

`npm run dev` sends `/api` and `/ws` to `http://localhost:3000`. Set `NONOS_API` in your shell to point it somewhere else.

`npm run zk:ballot` needs the Perpetual Powers of Tau file in `PTAU`. `BEACON_RPC` and `CONTRIBUTORS` change the node used for the beacon block hash and the number of phase-2 contributions. These variables are read from your shell, not from `.env`.

## Project layout

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
  ai/             optional built-in AI helpers
  jobs/           retention purge, payment checks, closing votes, reminders
  mappers/        database rows to API objects
  test/           integration tests
client/src/
  views/          one file per page
  components/     ui, task, drawer, docs, bounty, votes, plan, settings, help and more
  actions/        API calls and wallet flows grouped by domain
  lib/            dates, filters, quick-add parser, crypto, stealth, semaphore, decks, help
  state/          small store with optimistic updates
  realtime/       WebSocket client and event reducer
  types/          one type per file
client/public/zk/ circuit files served to browsers
docs/             these pages, also bundled into the app as its help center
circuits/         encrypted-ballot circuit and its setup record
scripts/          zk:fetch, zk:ballot and brand tools
deploy/tor/       Tor onion service image
marketing/        video kits; not part of the app or the Docker image
```

## The help center

The in-app help at `/help` renders the Markdown files in this `docs/` folder. Vite bundles them at build time (`client/src/lib/help/helpTopics.ts`), so the repository and the app always show the same text. `docs/README.md` is the index: its `##` headings become the groups in the help sidebar, and the order of its links sets the order of the topics. A page that isn't linked from the index still appears, under "More".

Pages are rendered by the app's own small Markdown component, which never treats text as HTML. It supports headings down to `###`, paragraphs, lists, tables, block quotes, code blocks, inline code, bold, italics and links. Keep each list item on one line and leave a blank line before a table. Links to other docs files (`votes.md`, `privacy-model.md#honest-limits`) open inside the help. Links to files outside `docs/` show as plain text in the app.

The Docker build copies `docs/` for this reason, so keep it in the build context.

## Stack

Node 22 with its built-in SQLite, Express, ws, @noble/curves and @noble/hashes, snarkjs, Semaphore, @zk-kit/baby-jubjub, poseidon-lite and the Anthropic SDK (used only when built-in AI is on). The web app uses React 18, TypeScript, Vite, dnd-kit, lucide icons and pptxgenjs. The Geist and JetBrains Mono fonts are bundled.

## House rules

[CONTRIBUTING.md](../CONTRIBUTING.md) in the source code has the house rules: one default export per file, small files, comments that explain why, privacy first, validation at the edge and tests for behaviour. Pull requests should pass `npm test`, `npm run typecheck` and `npm run build`.
