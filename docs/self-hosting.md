# Self-hosting

Nil's source is available under the Business Source License 1.1. You can build it and run it to try it, test it or audit it; running it in production for a team needs a license from NØNOS (write to ops@nonos.app). A server with 2 CPU cores and 2 GB of memory is a comfortable start for a team of a few dozen people, though these are starting points rather than measured limits. This page gets a copy running and explains the settings that matter. For a public server with HTTPS, backups and a launch checklist, follow [Production deployment](deploy.md).

Everyone who signs in needs a browser with an Ethereum wallet extension, or a wallet's in-app browser.

## With Docker

You need Docker with Compose v2.24 or newer.

```bash
git clone https://github.com/NON-OS/NIL.git nonos
cd nonos
cp .env.example .env        # APP_URL starts as http://localhost:3000 for trying it here
docker compose up -d --build
```

Open `http://localhost:3000`, connect your wallet and create the workspace. You become the owner. The database, uploaded files and the signing key live in the `nonos-data` volume.

The container runs as an unprivileged user (uid 1000) with a read-only root filesystem, no Linux capabilities and `no-new-privileges`. Only `/data` and `/tmp` are writable. If your own login on the server is uid 1000 too, as on many cloud images, read [the note in the deployment guide](deploy.md#1-pick-a-server) first.

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
APP_URL=http://localhost:5173 npm run dev
```

Open `http://localhost:5173`. `APP_URL` is required everywhere, because wallet sign-in messages name that domain. The API runs on port 3000 and restarts when the code changes; the web app reloads by itself. See [Development](development.md) for the other commands.

## Settings

Every setting is an environment variable. All of them are optional except `APP_URL`, and `NOX_RPC_URL` on a server people reach over the network; without those the server refuses to start. An empty value counts as unset, so the default applies. `.env.example` in the source code lists them all, grouped and explained. These matter most:

| Variable | Default | What it does |
|---|---|---|
| `APP_URL` | required | Your public address, like `https://nonos.example.com`. Used in sign-in messages, origin checks, links in the bounty and calendar feeds, and push notifications |
| `TRUST_PROXY` | off | Set to `1` behind a reverse proxy. Needed for secure cookies and correct visitor addresses |
| `DATA_DIR` | `./data` (`/data` in Docker) | Database, uploads and the signing key |
| `SOURCE_URL` | none | A link to the source code you run, shown in the app |
| `NOX_RPC_URL` | required, except on localhost | The Ethereum node to use, or `off` to turn on-chain features off. A server whose `APP_URL` is a localhost address falls back to a public node, with a warning |
| `NOX_VERIFIER_MODE`, `NOX_VERIFIER_KEY` | `off` | With Nil's verifier: `shadow` checks the node's answers on the side, `enforce` acts only on answers the verifier proved. See [Verified chain reads](#verified-chain-reads) |
| `REWARD_TOKENS` | USDC on mainnet | Extra bounty tokens, as `SYMBOL:address:decimals`, or `none` for NOX only |
| `PLAN_TREASURY` | none | Set only to charge workspaces for Nil Pro, in USDC or NOX. Unset means community mode |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | none | Both together give built-in AI a server-wide default. Each workspace can bring its own key in Settings → Connect AI instead. There's no default model |
| `TURN_URLS`, `TURN_SECRET` | none | The relay for calls and the secret it shares with Nil. Calls stay off without them, unless an admin allows direct connections. See [Set up calls](calls.md#set-up-calls) |
| `WALLETCONNECT_PROJECT_ID` | none | Turns on phone wallets over WalletConnect for computers without a wallet. Public, not a secret. See [Use a wallet on your phone](signing-in.md#use-a-wallet-on-your-phone) |

Other groups in `.env.example` cover sessions and uploads (`SESSION_DAYS`, `TRASH_DAYS`, `MAX_UPLOAD_MB`, `UPLOADS_PER_HOUR`, `UPLOAD_QUOTA_PER_MEMBER_MB`, `UPLOAD_QUOTA_PER_GUEST_MB`, `UPLOAD_QUOTA_MB`, `MAX_CAPSULE_MB`), encrypted files (`SEALED_FILE_MAX_MB`, `SEALED_UPLOADS_PER_HOUR`, `SEALED_CHUNKS_PER_MINUTE`, `SEALED_UPLOAD_STALE_MINUTES`, `FOLDER_ITEMS_MAX`), sign-in and access keys (`SIGNIN_CHAIN_TIMEOUT_SECONDS`, `SIGNIN_RESET_HOURS`, `SIGNIN_OWNER_RESET_WAIT_HOURS`, `SIGNIN_CONFIRM_MINUTES`, `ACCESS_KEY_MAX_DAYS`), the token and network (`NOX_TOKEN`, `NOX_CHAIN_ID`, `NOX_FINALITY_DEPTH`, `NOX_EXPLORER`), bounty payments (`PAYMENT_INTENT_DAYS`, `PAYMENT_WATCH_DAYS`), Nil Pro (`PLAN_PRICE_USD`, `PLAN_SEAT_USD`, `PLAN_FREE_SEATS`, `PLAN_PERIOD_DAYS`, `PLAN_GRACE_DAYS`, `PLAN_TRIAL_DAYS`, the NOX price and the perks), the token-holder door (`HOLDER_ZSP_NOX`, `HOLDER_RECHECK_HOURS`, `HOLDER_GRACE_DAYS`), private payouts, voting power and anonymous votes, push notifications (`PUSH_NOTIFICATIONS`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `PUSH_SERVICES`), due notes (`DUE_SOON_MINUTES`, `DUE_DAY_HOUR`), calls (`CALLS`, `TURN_TTL_SECONDS`, `CALL_MAX_PEERS`, `CALL_MESH_MAX_PEERS`, `CALL_SFU_MAX_PEERS`, `SFU_URL`, `SFU_API_KEY`, `SFU_API_SECRET`, `SFU_API_URL`, `STUN_URLS`, `CALL_RECORD_HOURS`, `CALL_RINGS_PER_PERSON`, `CALL_RING_WINDOW_MINUTES`, `CALL_RING_SECONDS`, `CALL_REJOIN_SECONDS`, `CALL_SIGNALS_PER_MINUTE`, `CALL_SIGNAL_MAX_KB`, `CALL_STARTS_PER_MINUTE`, and the relay's own `TURN_REALM`, `TURN_EXTERNAL_IP`, `TURN_ALLOWED_PEER_IP`, `TURN_MIN_PORT`, `TURN_MAX_PORT`, `TURN_CERT_DIR`, `TURN_LOG`) and calendar feeds (`CALENDAR_FEEDS`, `CALENDAR_FEED_PER_HOUR`).

A setting that is set but can't be used, such as a malformed number or treasury address, is named in a line starting with `[config]` in the startup log. The line says what the server does instead: use the default, or stay in community mode.

## Choices to make

### Your Ethereum node

The server checks payments, balances, stakes and passes through `NOX_RPC_URL`. Whatever node you name sees every address and transaction your server looks up, and your server's IP address. Use your own node, or a provider you trust, for privacy. The server refuses a node on a different network from `NOX_CHAIN_ID`.

### Verified chain reads

A node can also be wrong, or lie. Nil acts on what it says: a payment counts once the node shows the transfer, a vote counts the NOX the node says a wallet held, the holder door opens on a balance, and a smart wallet signs in when the node says its contract agreed. Nil's verifier lets Nil check those answers instead of trusting them. It is a light client built on [Helios](https://github.com/a16z/helios) that you run next to Nil, once per server however many workspaces it has (about 200 MB of memory). It follows the beacon chain from a checkpoint you choose and checks every answer from your execution node against blocks the beacon chain's sync committee signed: state reads through Merkle proofs, receipts and logs against each block's receipts root. Each answer it proved goes back sealed with a key that only it and Nil hold.

`NOX_VERIFIER_MODE` says what Nil does with it:

| Mode | Where Nil's answers come from | When the verifier proves an answer false | When it can't check one |
|---|---|---|---|
| `off` (default) | the node in `NOX_RPC_URL` | nothing checks | nothing checks |
| `shadow` | still the node, as before; each answer is also checked through the verifier at `NOX_VERIFIER_URL`, on the side | Nil has already acted on it; admins see a notice for a day and the log gets an error line (on hosted servers, an operator alert) | it is logged, nothing else |
| `enforce` | only the verifier, in `NOX_RPC_URL` | it is thrown away and nothing is counted on it; the notice shows | payments wait, votes don't open, nobody joins or is turned away |

Shadow can't stop a lie, but it tells you whether your node lies before anything depends on the verifier: a verifier that is down, behind or wrong never holds up a payment in shadow mode. Run shadow first, and switch to enforce once your node is synced and a week of shadow shows no mismatches (`/healthz` shows `"mismatchAt": null` under `chain.verification`, and the log has no `[verification]` error lines).

To turn it on with Docker Compose:

1. Take a checkpoint: the root of a recent finalized beacon block, from two beacon APIs run by different people that agree. If they differ, a new epoch was just finalized; ask again.

   ```bash
   curl -s https://ethereum-beacon-api.publicnode.com/eth/v1/beacon/headers/finalized | jq -r .data.root
   curl -s https://lodestar-mainnet.chainsafe.io/eth/v1/beacon/headers/finalized | jq -r .data.root
   ```

2. Make a key with `openssl rand -hex 32`.
3. Create `verifier.env` next to `docker-compose.yml`, readable only by you, with the `VERIFIER_` settings from `.env.example`:

   ```bash
   VERIFIER_EXECUTION_RPC=https://<your-own-node>
   VERIFIER_CONSENSUS_RPC=https://<a-beacon-api>
   VERIFIER_CHECKPOINT=0x<the root from step 1>
   VERIFIER_KEY=<the key>
   ```

4. In `.env`, set `NOX_VERIFIER_KEY` to the same key, `NOX_VERIFIER_MODE=shadow`, `NOX_VERIFIER_URL=http://verifier:8545`, and `COMPOSE_PROFILES=verifier` (Compose reads that one; Nil ignores it). Leave `NOX_RPC_URL` at your node.
5. `docker compose up -d --build`. `docker compose exec verifier wget -qO- http://127.0.0.1:8545/healthz` answers `"ok":true` once the light client is in step, usually within seconds, and Nil's own `/healthz` shows `"verification"` with `"mode": "shadow"`.
6. A week later, with no mismatch: set `NOX_VERIFIER_MODE=enforce` and `NOX_RPC_URL=http://verifier:8545` (the verifier relays the few requests it doesn't prove, see below), drop `NOX_VERIFIER_URL`, and recreate the container.

Without Docker, run `npm run verifier` with the same settings in its environment. Keep its port away from the internet: only your Nil server should reach it.

The execution node has to answer `eth_getProof` for recent blocks. Reth needs `--rpc.eth-proof-window` for that (the bundled node in [cloud/docker-compose.chain.yml](../cloud/docker-compose.chain.yml) has it); Geth and Nethermind answer by default; `ethereum-rpc.publicnode.com` keeps no proof window, so through it only receipts, logs and blocks verify and every balance is refused. The consensus API needs the light-client endpoints: your own Lighthouse with `--http` (current releases serve them unless `--disable-light-client-server` is given), or a public beacon API that serves them.

What Nil reads, and what rests on it:

| What | JSON-RPC methods | What it decides | Through the verifier |
|---|---|---|---|
| Bounty and Nil Pro payments | `eth_getTransactionReceipt`, `eth_getLogs` | whether a payment is credited | proven; a receipt the node says it lacks only makes the payment wait |
| Finality and block hashes | `eth_getBlockByNumber`, `eth_blockNumber` | when a payment counts, which block it is in, and its time against the invoice window | proven |
| NOX, staked NOX, Zero-State Passes | `eth_call` (`balanceOf`, `getStakeInfo`) at a block or the latest | voting power, the holder door, admins' NOX perks | proven |
| The NOX price | `eth_call` to the Uniswap pair or pool and the Chainlink feed | how much NOX an invoice asks for | proven; without an answer the manual price or USDC only, as before |
| NOX's transfer fee | `eth_call` (`fees()`) | whether a payment short by exactly that fee still counts | proven |
| Smart-wallet signatures | `eth_call` (EIP-1271 `isValidSignature`, the EIP-6492 validator) | sign-in | proven |
| Private payouts | `eth_getTransactionReceipt` (ERC-5564 announcements), `eth_getBalance`, `eth_call` | whether a payout was announced, the balance a payee sees | proven |
| The network | `eth_chainId` | refusing a node on another chain | from the verifier's own `VERIFIER_NETWORK` |
| Moving a private payout | `eth_sendRawTransaction`, `eth_estimateGas`, `eth_maxPriorityFeePerGas`, `eth_getTransactionCount` (pending) | building and sending a transaction the payee signed | relayed unproven: a wrong answer makes the transaction fail or cost more gas, nothing more |

The verifier refuses every other method.

In shadow mode Nil checks the answers it used: a state read (`eth_call`, a balance) against the verifier's proof of the same read at the newest block the verifier has, since the node and the verifier may be a block apart; a receipt or a log against the proven receipts of its own block; a block against the proven hash for its height. A check that can't be made is logged and dropped. At most `NOX_VERIFIER_SHADOW_MAX` checks run at once.

In enforce mode, when Nil can't verify (the verifier is down or still catching up, its checkpoint is too old, the node's answer failed its proof), it neither counts nor refuses anything on it. Payments and invoices wait and are checked again every minute, new token-weighted votes don't open, nobody joins through the holder door and nobody already in is turned out, and a smart wallet is asked to try again. Admins see a notice on Settings → Plan, on Bounties and on Votes that says why. An answer that failed its proof stays on that notice for a day (`NOX_VERIFY_MISMATCH_HOURS`), since it means the node said something false.

What the verifier doesn't do, plainly:

- Shadow mode prevents nothing: it finds a lie after Nil acted on it. Only enforce keeps a false answer from counting.
- It proves that what the node says is true, not that the node said everything. The node can leave a transfer out of `eth_getLogs`, or say a transaction doesn't exist. So in enforce mode a lying node can hide a payment, or hold it back, but it can't fake one; shadow mode can't notice either. Since a missing transaction can't be proven missing, Nil in enforce mode never fails a bounty payment over one; an admin who knows a transaction was never sent cancels the payment. A Nil Pro transaction is still given up on after `NOX_MISSING_TX_HOURS`, as in every mode: that only lets its invoice expire, and the reconciliation counts it as credit if it turns up. Shadow mode also can't catch a node that says a block is final too early, only one that gives the wrong block for a height. Colibri (`@corpus-core/colibri-stateless`) can prove a list of logs complete up to a pinned block; Nil doesn't use it yet.
- It can't prove anything about blocks older than about 27 hours: Ethereum keeps the hashes of the last 8,191 blocks in its state (EIP-2935), and that is how the verifier ties an older block to the chain it follows. In enforce mode a payment first checked after that waits with a note on it and isn't counted by itself (see [the troubleshooting entry](deploy.md#a-payment-says-it-is-older-than-nils-verifier-can-check) for what an operator can do), and the treasury scan stays inside that window too.
- The checkpoint is trusted. Started from a wrong one, the light client can follow a chain only the checkpoint's signers vouch for. Take it from two sources that agree, and keep it younger than two weeks: the verifier refuses an older one outright (`VERIFIER_CHECKPOINT_MAX_AGE_DAYS`, 14 at most). Helios's own age check is off by default and can't be turned on from Node, so the verifier does it itself: it hashes the checkpoint's beacon header to the checkpoint and takes the age from that header's slot. It keeps the newest checkpoint it reaches in `VERIFIER_DATA_DIR`, so a restart needs no new one unless it was stopped for close to two weeks.
- The consensus API can't make it accept a false answer, since every light-client update carries the sync committee's signatures. It can keep the verifier from following the chain, and then nothing is verified. Helios's default consensus API is run by a16z; the verifier has no default, so you choose one.
- Helios is unaudited. Nil pins version 0.12.0 exactly. A bug in it could let a false answer through. Nil still checks what it can on top (the real token contract, the receiver, the exact amount), but the proof is Helios's.
- The verifier itself is trusted: in enforce mode Nil believes anything sealed with `NOX_VERIFIER_KEY`. Run your own, on the same server or private network as Nil, and keep the key as secret as a password.
- It changes nothing for privacy. It asks your execution node about the same addresses Nil looks up, plus the proofs that check them. The consensus API only learns that a light client follows the chain.

### Charging or not

Leave `PLAN_TREASURY` unset to run in community mode, with every tool unlocked. Set it only if you run Nil for others and want them to pay you for Nil Pro, in USDC or NOX. See [NOX, voting power and Nil Pro](nox-and-nil-pro.md) and [Charging for Nil Pro](deploy.md#charging-for-nil-pro).

### Built-in AI

With `ANTHROPIC_API_KEY` (or `ANTHROPIC_AUTH_TOKEN`) and `ANTHROPIC_MODEL` set, text goes to Anthropic only when someone clicks an AI button. Leave it unset and no task data ever goes there. Connecting your own assistant over MCP works either way. See [AI assistants](ai-assistants.md).

### Calls

Calls need a TURN relay so nobody in a call learns anyone else's IP address. `docker-compose.yml` runs a hardened coturn with `COMPOSE_PROFILES=calls`. It needs these ports open to the internet: 3478 over UDP and TCP, 5349 over TCP for TURN over TLS, and 49160 to 49999 over UDP for the media it relays. [Set up calls](calls.md#set-up-calls) walks through it. Without a relay, calls are off, unless an admin allows direct connections, which shows people in a call each other's IP addresses. For calls of more than four, the same profile runs an SFU, LiveKit, which forwards frames encrypted in the browsers and can't open them. It needs 7881 over TCP and 50000 to 50200 over UDP, and its host name sent to 127.0.0.1:7880 by Caddy.

### Tor and memory-only mode

Nil can run as a Tor onion service; see [Tor onion service](tor.md). It can also keep its data in memory only, so nothing is written to disk; see [Zero-state](zero-state.md#memory-only-mode).

## Running it well

- Run exactly one copy. Nil uses SQLite and keeps live updates and rate limits in memory, so it can't run behind a load balancer with several replicas. Calls are the exception: they're kept in the database and work across several processes sharing it.
- Back up the data folder, and above all `DATA_DIR/keys`. See [Backups and moving](backups-and-moving.md).
- Read the changelog before you upgrade. Database migrations run on start and only go forward.
