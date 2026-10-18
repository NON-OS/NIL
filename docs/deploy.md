# Production deployment

This guide puts Nil on a Linux VPS with Docker, behind Caddy for automatic HTTPS. It ends with an optional Tor onion service, backups, upgrades, a pre-launch checklist and troubleshooting.

The commands assume Debian or Ubuntu, a domain called `nonos.example.com` and the code in `/opt/nonos`. Change them to match yours.

## What you end up with

```
browser ──HTTPS──> Caddy (ports 80, 443) ──> nonos:3000 (Docker network only)
                                               │
                                               ├─ nonos-data volume: database, uploads, signing key
                                               └─ outbound: your Ethereum node, Anthropic (only if AI is on)
```

Nil has no port open to the internet. Only Caddy does.

## 1. Pick a server

| Need | Details |
|---|---|
| Size | 2 vCPU, 2 GB RAM and 20 GB of SSD is a comfortable start for a team of a few dozen people. These are starting points, not measured limits. Building the Docker image on the server uses most of that memory. With 1 GB of RAM, add swap for the build (but see the note on swap in [memory-only mode](zero-state.md#memory-only-mode)) |
| One instance | Nil uses SQLite, and keeps live updates and rate limits in memory. Run exactly one copy. Don't put it behind a load balancer with several replicas |
| Software | Docker Engine with the Compose plugin, version 2.24.4 or newer (the compose files use `!reset` and `!override`). Check with `docker compose version`. On Ubuntu or Debian, the commands are below the table; for other systems, see docs.docker.com/engine/install |
| Outbound access | The server needs HTTPS out to your Ethereum node, to Anthropic if you turn AI on, to the browser makers' push services (`PUSH_SERVICES`) once someone turns on push notifications, to Let's Encrypt for certificates, and to Docker Hub and the npm registry while building. `PUSH_NOTIFICATIONS=off` keeps the server from ever contacting a push service |
| A wallet | You sign in with an Ethereum wallet in your browser (an extension such as MetaMask or Rabby, or a wallet's in-app browser). Have one ready, plus a second wallet to link as a backup |

Docker on Ubuntu, from Docker's own package repository (on Debian, use `debian` in both URLs):

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker compose version
```

Nil runs as uid 1000 inside its container, and on many cloud images the first login user (such as `ubuntu`) is uid 1000 too, with sudo. Someone who broke out of the container would then be that user. Check with `id -u`; if it prints 1000, run the server from another login user, or move this one to another uid with `sudo usermod -u 1500 <user>` while it has nothing running. Don't add your user to the `docker` group, which is as powerful as root.

## 2. Point DNS at the server

Create an `A` record for `nonos.example.com` with the server's IPv4 address, and an `AAAA` record if it has IPv6. Wait until it resolves:

```bash
dig +short nonos.example.com
```

Caddy can only get a certificate once this returns your server's address.

## 3. Set up the firewall

Allow SSH, HTTP and HTTPS, and nothing else:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp      # HTTP/3, optional
sudo ufw enable
```

`OpenSSH` means port 22. If your SSH server listens somewhere else (check with `sudo ss -tlpn | grep sshd`), allow that port instead, before `ufw enable`, or the firewall locks you out.

Docker writes its own firewall rules for published ports, and those skip ufw. That is why `docker-compose.yml` publishes Nil's port 3000 on the loopback interface only (`127.0.0.1:3000`), which nothing outside the machine can reach, and the override in step 6 removes even that. Only Caddy publishes ports to the internet.

## 4. Get the code

```bash
sudo git clone https://github.com/NON-OS/NIL-.git /opt/nonos
cd /opt/nonos
sudo git checkout <release>          # the release tag or branch you want to run
```

If the repository is private, a fork for example, sign in first with `gh auth login` or give the server a read-only deploy key; an anonymous clone can't reach it. Any folder works in place of `/opt/nonos`: the data volume's name is fixed in `docker-compose.yml`, so the backup commands below work wherever the code is.

Build from a fresh clone like this. The image never takes local data: `.dockerignore` leaves out data folders, databases, capsules, exports, `.env` files and keys wherever they sit (a development copy keeps its database under `server/data/`, for example), and the Dockerfile removes any that still slip into the server folder. A fresh clone is still the cleanest starting point.

## 5. Configure Nil

```bash
sudo cp .env.example .env
sudo chmod 600 .env
sudo nano .env
```

Set at least these:

```bash
APP_URL=https://nonos.example.com
TRUST_PROXY=uniquelocal
NOX_RPC_URL=https://<your-own-node>
SOURCE_URL=https://github.com/<you>/nonos
STRICT_CONFIG=1
```

- `APP_URL` is required and must be exactly the address people type. Wallets show this domain in the sign-in message, and only this origin may make changes. Nil never reads it from the request, so a phishing site can't get a sign-in message that names its own domain. Without it, the server refuses to start.
- `TRUST_PROXY=uniquelocal` tells Nil to believe forwarded headers only from a private address, which is where Caddy reaches it on the Docker network. Without it, cookies lose the `Secure` flag and `__Host-` prefix, HSTS isn't sent, and rate limits see Caddy's address instead of the visitor's. A hop count (`1`) also works, but only while port 3000 is closed to everything except Caddy: anyone who reaches the port directly could otherwise claim any IP address. `true` is refused.
- `NOX_RPC_URL` is required on a server people reach over the network (see the table below), or `off`.
- `SOURCE_URL` is where people can get the source code you run, which the AGPL asks for.
- `STRICT_CONFIG=1` makes the server refuse to start while any `[config]` warning remains, so a typo stops the deploy instead of quietly changing behaviour. In production the server also warns about an https `APP_URL` without `TRUST_PROXY`, and about a `NOX_RPC_URL` that names the public node. That second warning counts too: with `STRICT_CONFIG=1`, a server pointed at the public node doesn't start. Use your own node or a provider you trust, or, if you accept what the public node sees, leave `STRICT_CONFIG` out.

Then decide on these:

| Variable | Recommendation |
|---|---|
| `NOX_RPC_URL` | Required. Your own Ethereum node (an execution client such as Geth, Nethermind or Reth, with a consensus client), or a provider you trust. The node sees every wallet and payout address your server looks up, and from which IP. Nil reads private-payout balances one address at a time at random moments, with other payees' addresses mixed in, and reads vote snapshots in a shuffled order a few wallets at a time, so a node can't group one person's addresses by timing. It can still tell that a snapshot's wallets were read together. Only your own node keeps every lookup to yourself. Use `off` if you don't want any on-chain features |
| `REWARD_TOKENS` | Leave the default (USDC on mainnet) or set `none` for NOX only. Change it if `NOX_CHAIN_ID` is not 1 |
| `PLAN_TREASURY` | Leave unset. The server then runs in community mode, with every tool unlocked. Set it only if you run Nil for others and charge them for Nil Pro; see [Charging for Nil Pro](#charging-for-nil-pro) |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Only if you want built-in AI: the key and the name of the Anthropic model to use. Text goes to Anthropic only when someone clicks an AI button |
| `MAX_UPLOAD_MB` | Raise it if your team attaches large files (default 25) |

Don't set `DATA_DIR` in Docker. The image already uses `/data`, which is the `nonos-data` volume. Every variable is explained in [.env.example](../.env.example).

### Charging for Nil Pro

Skip this unless you set `PLAN_TREASURY`. Billing runs inside each server and has to be right on its own, so set it up with care:

- Prices. `PLAN_PRICE_USD` is the flat fee per period and `PLAN_SEAT_USD` the price per person above `PLAN_FREE_SEATS`. Invoices are paid in USDC at face value (`PLAN_USDC`) or in NOX with `PLAN_NOX_DISCOUNT` off.
- The NOX price. Point `PLAN_NOX_POOL` at the NOX/WETH pool with the most liquidity. Today that is the Uniswap V2 pair `0x07ce5889d2eb681af3bd61db24ab2602c502bd1b`; there is no NOX pool on Uniswap V3 yet. The server reads the pool's average price over `PLAN_TWAP_MINUTES` (30) and multiplies it by Chainlink's ETH/USD feed. A V3 pool keeps that history itself. A V2 pair doesn't, so the server records the pair's cumulative price every minute and prices NOX from it only once it has a whole window recorded: after the server first starts with a V2 pair, or after it was down for more than two windows, NOX invoices use `PLAN_NOX_USD` for that long.
- Why the bounds matter. The NOX/WETH pair is thin, about 32 WETH on each side in October 2026. A 30-minute average means one trade can't move the price, but someone willing to hold a skewed price for the whole window can. Set `PLAN_NOX_USD_MIN` and `PLAN_NOX_USD_MAX` close to the market, so a pushed pool or a broken feed falls back to `PLAN_NOX_USD` instead of mispricing invoices, and set `PLAN_NOX_USD` as that fallback. Without any of these, invoices are USDC only.
- Several workspaces on one treasury. Give each server its own `PLAN_INVOICE_SLOT` (`index/count`, for example `17/500`) and all of them the same `PLAN_INVOICE_KEY`, a long random secret kept out of the workspaces' reach. Each server then asks for amounts no other server can ask for, so one transfer can never pay two workspaces, and under- and overpayments from any wallet are matched to the right invoice. Size `PLAN_SUFFIX_DIGITS` so each slot has room: a slot has about 10^digits / count suffixes, and each invoice holds one for its window plus `PLAN_LATE_DAYS`. With 4 digits (the default) and 50 servers, that's about 200 per server. A server that is alone on its treasury sets `PLAN_INVOICE_SLOT=0/1`.
- Finality. Payments count once their block is finalized. If your node doesn't support the `finalized` tag, `NOX_FINALITY_DEPTH` (64) blocks under the head is used instead.
- Perks and the burn. `PRO_FOR_ZSP`, `PLAN_STAKER_TIERS`, `BURN_SHARE` and `BURN_REPORT_URL` set the NOX perks and the published burn share; see [NOX, voting power and Nil Pro](nox-and-nil-pro.md#where-the-money-goes).
- What stays with the server. The paid-until date, the trial's start, invoices and payments live in their own tables. Erasing the workspace keeps them (without who paid), and restoring a capsule brings none of them, so neither can reset a trial or replay a payment. A capsule moved to a new server starts that server's own trial, so a host that charges should give each customer one server and not hand out new ones for restores.

## 6. Add Caddy

Create two files next to `docker-compose.yml`. They belong to this server, not to the repository.

`/opt/nonos/Caddyfile`:

```
nonos.example.com {
	encode zstd gzip
	reverse_proxy nonos:3000
}
```

Caddy gets and renews the certificate, redirects HTTP to HTTPS, passes WebSocket connections through and sets the `X-Forwarded-*` headers Nil reads. `encode` compresses what it sends, which makes the app's files and the task data it starts with several times smaller on the wire. It keeps no access log unless you add a `log` directive. To receive certificate expiry notices, add a global options block with your email at the very top of the file:

```
{
	email you@example.com
}
```

`/opt/nonos/docker-compose.override.yml`:

```yaml
# Local to this server. Docker Compose merges this file into docker-compose.yml
# whenever you run `docker compose` in /opt/nonos.
services:
  nonos:
    # no port on the host: only Caddy reaches Nil, over the Docker network
    ports: !reset []

  caddy:
    image: caddy:2
    restart: unless-stopped
    # wait until Nil answers its health check, so Caddy never proxies to a server still starting
    depends_on:
      nonos:
        condition: service_healthy
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config

volumes:
  caddy-data:
  caddy-config:
```

To keep `git status` clean, list both files in `.git/info/exclude`:

```bash
printf 'Caddyfile\ndocker-compose.override.yml\n' | sudo tee -a .git/info/exclude
```

If you prefer Caddy from your distribution's packages, skip the override file. `docker-compose.yml` already publishes Nil on the loopback interface only, and Docker hands those connections to Nil from its own private network, so `TRUST_PROXY=uniquelocal` still fits. Point Caddy at it:

```
nonos.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

## 7. Build and start

```bash
cd /opt/nonos
sudo docker compose up -d --build
sudo docker compose ps                 # nonos should become "healthy"
sudo docker compose logs -f            # Ctrl+C to stop following
```

Then check from your own computer:

```bash
curl -sI https://nonos.example.com/healthz
curl -sI https://nonos.example.com | grep -iE 'strict-transport|content-security'
```

The first should answer `200`. The second should show both headers. If `Strict-Transport-Security` is missing, `TRUST_PROXY` isn't set, or doesn't match the address Caddy connects from.

`/healthz` answers `503` when the database doesn't respond. Its body shows the version, the database schema, when each background job last succeeded and failed, and whether the Ethereum node answered the last time it was asked. It holds nothing about the workspace or its people, so it is safe to leave public.

The Nil container runs as an unprivileged user with a read-only root filesystem, no Linux capabilities and `no-new-privileges`. Only `/data` and `/tmp` are writable.

## 8. First sign-in and the first admin

Do this right after the first start. Creating the workspace, or restoring a capsule into the empty server, needs a one-time setup token, so nobody who finds the server first can claim it. Unless you set `SETUP_TOKEN` yourself, the server makes one at first start and prints it once in the log:

```bash
sudo docker compose logs nonos | grep 'setup token'     # prints a secret: keep it out of chats and tickets
sudo docker compose exec nonos cat /data/setup-token     # the same token, if the log has rotated
```

The token stops working, and the file is deleted, once the workspace exists. If you set `SETUP_TOKEN` in `.env`, remove it afterwards.

1. Open `https://nonos.example.com`. You see **Set up your workspace**.
2. Enter the setup token, the workspace name and your name. You can rename the workspace later in **Settings → Workspace**. People's encrypted-docs, private payout and voting keys don't depend on the name.
3. Click **Create workspace with your wallet** and sign the message. Check that the domain in the message is yours. You are now the **owner**.
4. Link a second wallet: **Settings → Sign-in & security → Your wallets**. Your wallets are your only way in. Nobody can add a wallet to your account for you.
5. Add at least one more admin, ideally a second owner: **Settings → Team → Invite people**, choose **Admin**, and send the link privately. Or change the role of an existing member under **Members**. Only an owner can make someone an owner.

If the workspace was set up by mistake, and there is nothing in it you need, reset it:

```bash
sudo docker compose rm -sf nonos
sudo docker volume rm nonos_nonos-data
sudo docker compose up -d
```

Then review these settings:

- In **Settings → Plan**, the badge should say **Community mode**, unless you set `PLAN_TREASURY`.
- In **Settings → Team → Sharing**, decide who can invite (admins only by default) and whether share links are allowed (off by default).
- In **Settings → Team → Token holders**, the token-holder door stays closed until you open it.
- In **Settings → Team → Voting power**, set the power per Zero-State Pass.
- In **Settings → Data & privacy → Zero-state**, choose how long finished work, comments and history are kept (forever by default).
- On **Bounties**, add treasury addresses (for example your Safe) if bounties are paid from one.

## 9. Optional: Tor onion service

Nil can also be reached as a Tor onion service. Details are in [Tor onion service](tor.md). Since v3, a wallet is the only way to sign in, and Tor Browser ships without wallet extensions, so plan how your team will sign in first.

The Tor container is built from a Debian image pinned by digest, and runs with a read-only root, `no-new-privileges` and only the capabilities it needs to hand its key folder to Tor's own user, which Tor then switches to.

### Onion and HTTPS together

When you pass `-f`, Compose stops loading the override file automatically, so list it:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.tor.yml up -d --build
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.tor.yml exec tor cat /var/lib/tor/nonos/hostname
```

`docker-compose.tor.yml` removes Nil's published port. If your override publishes `127.0.0.1:3000` for a Caddy on the host, list the override after the Tor file so the port comes back.

Keep `APP_URL` set to your HTTPS address and add the onion address to `ALLOWED_ORIGINS` (`ALLOWED_ORIGINS=http://<your-address>.onion`). Onion visitors then see the onion address in the wallet sign-in message. The messages that unlock and publish encryption keys always name the `APP_URL` address, so people's keys are the same on both addresses, but on the onion address a wallet may warn that such a message names another site. All onion visitors reach Nil from the Tor container's address, so they share one set of rate limits.

### Onion only

Skip Caddy and follow [Tor onion service](tor.md): start once to create the address, then set `APP_URL=http://<your-address>.onion` and recreate the container. The Tor file already removes the published port, so the server answers only through Tor. Leave `TRUST_PROXY` empty. Back up the `tor-keys` volume to keep the onion address.

## 10. Backups

### What to back up

Everything Nil stores is in the `nonos-data` volume, mounted at `/data` in the container. The volume is always called `nonos_nonos-data`, whatever folder the code is in, because `docker-compose.yml` fixes the name.

| Path in `/data` | What it is |
|---|---|
| `nonos.db`, `nonos.db-wal`, `nonos.db-shm` | The SQLite database. Don't copy these files while the server runs: use a snapshot (below) |
| `keys/receipts-ed25519.pem` | The workspace signing key. It signs receipts, and every message that unlocks or publishes someone's encryption keys names the workspace by it. Without it, no wallet opens anyone's encryption keys and recovery kits won't restore, so everyone starts over with new keys |
| `uploads/` | File attachments |
| `pre-migration-*.db` | Copies of the database the server takes before each schema upgrade. The newest three are kept |
| `setup-token` | The one-time setup token, only until the workspace exists |

Also keep `/opt/nonos/.env`, `Caddyfile` and `docker-compose.override.yml`, and the `tor-keys` volume if you use Tor. Caddy's certificates are re-issued automatically and don't need a backup.

Backups hold most of the workspace in readable form: team tasks, comments, files and the signing key. Only docs, the words of private tasks and encrypted ballots stay encrypted. Encrypt backups before they leave the server, for example with `age`, `gpg` or `restic`.

### Nightly backup while running

This script takes a consistent database snapshot with SQLite's `VACUUM INTO`, copies the key and uploads, and keeps 14 days. It assumes the default database location (if you set `DB_FILE`, adjust it). Save it as `/opt/nonos-backup.sh`:

```sh
#!/bin/sh
# Backs up Nil while it runs: a consistent database snapshot, the signing key and the uploads.
set -eu
cd /opt/nonos
STAMP=$(date +%F-%H%M)
DEST=/var/backups/nonos
WORK="$DEST/$STAMP"
mkdir -p "$WORK"
chmod 700 "$DEST"

# 1. a consistent snapshot of the database, written next to it
docker compose exec -T nonos rm -f /data/backup.db
docker compose exec -T nonos node --disable-warning=ExperimentalWarning -e \
  "new (require('node:sqlite').DatabaseSync)('/data/nonos.db').exec(\"VACUUM INTO '/data/backup.db'\")"

# 2. everything in /data: the snapshot, keys/ and uploads/
docker compose cp nonos:/data/. "$WORK/"
docker compose exec -T nonos rm -f /data/backup.db

# 3. keep the snapshot, not the live database files copied while the server ran
rm -f "$WORK/nonos.db" "$WORK/nonos.db-wal" "$WORK/nonos.db-shm"
mv "$WORK/backup.db" "$WORK/nonos.db"
rm -rf "$WORK"/restore-* "$WORK"/capsule-* "$WORK"/pre-migration-*.db "$WORK"/setup-token

tar -C "$DEST" -czf "$DEST/nonos-$STAMP.tar.gz" "$STAMP"
rm -rf "$WORK"
chmod 600 "$DEST/nonos-$STAMP.tar.gz"
find "$DEST" -name 'nonos-*.tar.gz' -mtime +14 -delete
```

Run it every night at 03:15:

```bash
sudo chmod 700 /opt/nonos-backup.sh
echo '15 3 * * * root /opt/nonos-backup.sh >> /var/log/nonos-backup.log 2>&1' | sudo tee /etc/cron.d/nonos-backup
```

Then copy the archives off the server, encrypted.

### Cold backup

Stopping Nil for a moment lets you copy the whole volume as it is:

```bash
cd /opt/nonos
sudo docker compose stop nonos
sudo docker run --rm -v nonos_nonos-data:/data:ro -v /var/backups/nonos:/backup alpine \
  tar -czf /backup/nonos-cold-$(date +%F).tar.gz -C /data .
sudo docker compose start nonos
```

### Encrypted capsule

An admin can download an encrypted capsule from **Settings → Data & privacy**: the database, uploads and signing key in one AES-256-GCM file, locked with a passphrase of at least 12 characters. It is the easiest copy to keep off-site and the way to move servers. Keep the passphrase in a password manager. A capsule restores only into a server that has no workspace yet.

### Restore from a backup archive

On this server or a new one, with the code and config in `/opt/nonos`:

```bash
cd /opt/nonos
sudo docker compose down                       # stops containers, keeps volumes
sudo docker compose create                     # makes sure the volume exists on a new server
sudo mkdir -p /tmp/nonos-restore
sudo tar -xzf /var/backups/nonos/nonos-2026-10-15-0315.tar.gz -C /tmp/nonos-restore
sudo docker run --rm \
  -v nonos_nonos-data:/data \
  -v /tmp/nonos-restore/2026-10-15-0315:/restore:ro \
  alpine sh -c 'rm -rf /data/* && cp -a /restore/. /data/ && chown -R 1000:1000 /data && chmod -R go-rwx /data'
sudo rm -rf /tmp/nonos-restore
sudo docker compose up -d
```

The `rm -rf /data/*` step also removes old `-wal` and `-shm` files. Never leave those next to a restored `nonos.db`: SQLite would apply them to the wrong database.

For a cold backup, extract the archive and copy it into the volume the same way (it already has the layout of `/data`).

Sessions in the backup stay valid, so people who were signed in when it was taken stay signed in.

### Restore from a capsule

Start Nil on a server with an empty volume. Open the site, choose **Moving servers? Restore from an encrypted capsule**, enter the setup token from the log (section 8), pick the file and enter the passphrase. Everyone signs in again afterwards. Capsules larger than `MAX_CAPSULE_MB` (4096 by default) are refused.

Keep the same `APP_URL` if you can. The messages that unlock people's encryption keys name it, so at a new address each person restores their keys from their recovery kit once, or starts over (see [Backups and moving](backups-and-moving.md#move-to-a-new-server)).

### Test your restores

Restore a backup onto a spare machine at least once before launch, and again after major upgrades. Sign in, open an encrypted doc and download a proof file to check the key came across.

## 11. Upgrades

Read [CHANGELOG.md](../CHANGELOG.md) first. Then:

```bash
cd /opt/nonos
sudo /opt/nonos-backup.sh                  # always back up first
sudo git fetch --tags
sudo git checkout <new release>            # or: sudo git pull, if you follow a branch
sudo docker compose build --pull           # --pull also picks up base image security fixes
sudo docker compose pull caddy             # skip if Caddy runs on the host
sudo docker compose up -d
sudo docker compose logs -f nonos
sudo docker image prune -f
```

- Database migrations run automatically when the server starts. They only go forward. Before the first one runs, the server saves a copy of the database as `/data/pre-migration-<time>-schema-<n>.db` and says so in the log. It keeps the newest three. Each is a full copy, including anything zero-state retention has erased since, so delete them once you're happy with the upgrade.
- An older release refuses to start on a database a newer one has upgraded, and says which schema it found. To roll back, check out the previous release **and** restore the backup you took before upgrading (or the `pre-migration-*.db` copy, in place of `nonos.db`, with the server stopped and the old `-wal` and `-shm` files removed).
- On `docker compose up -d` or `stop`, Nil gets SIGTERM and stops cleanly: requests in progress finish, open tabs are told to reconnect, and the database is closed. `docker-compose.yml` gives it 30 seconds (`stop_grace_period`); it exits with an error if it needs longer than `SHUTDOWN_TIMEOUT_SECONDS` (20).
- The app updates itself in open browsers on the next page load.
- After changing only `.env`, apply it with `sudo docker compose up -d --force-recreate nonos`.

### Servers whose folder isn't called nonos

Compose used to name the data volume after the folder the code is in. `docker-compose.yml` now
fixes it as `nonos_nonos-data`, which is what a folder called `nonos` (such as `/opt/nonos`)
always had, so those servers need nothing. If your code is in a folder with another name, copy
the data across once before starting the new release, or Nil starts on an empty volume. With
the code in `/srv/nil/app`, for example:

```bash
sudo docker compose down
sudo docker volume create nonos_nonos-data
sudo docker run --rm -v app_nonos-data:/from:ro -v nonos_nonos-data:/to alpine cp -a /from/. /to/
sudo docker compose up -d
```

Check the site, then remove the old volume with `sudo docker volume rm app_nonos-data`.

### Upgrading from 3.0.0

This release changes how encryption keys are made and checked (see [Encryption and trust](encryption.md)). Keys from 3.0.0 can't be checked, so the upgrade removes them, together with everyone's private payout and voting keys, and each person sets up new keys on their next unlock. Nothing in this release opens what was sealed to the old keys: docs and private tasks encrypted on 3.0.0 stay locked, and private payouts received on 3.0.0 can't be moved from Nil. Before upgrading, have people download the docs they want to keep with the download arrow, copy out what they need from their private tasks, and move their private payouts out (or copy each one's key with **Key**).

### Upgrading from v2

Version 3 removes email, password and passkey sign-in. The upgrade deletes every non-wallet sign-in method and the email column. Before upgrading, make sure every person, owners and admins first, has linked an Ethereum wallet to their account while still on v2. Anyone without a linked wallet can't sign in after the upgrade and has to be invited again as a new account.

### Upgrading from v1

Version 1 had no wallet sign-in. Upgrade to v2 first, have everyone link a wallet, then upgrade to v3.

## 12. Pre-launch checklist

- [ ] `dig +short nonos.example.com` returns the server's address.
- [ ] `https://nonos.example.com` loads with a valid certificate, and `http://` redirects to it.
- [ ] Port 3000 is closed from the outside: `curl -m 5 http://<server-ip>:3000/healthz` from another machine fails.
- [ ] `.env` has `APP_URL`, `TRUST_PROXY` set to Caddy's address range (`uniquelocal`), `NOX_RPC_URL`, `SOURCE_URL` and `STRICT_CONFIG=1`, no `DATA_DIR`, and permissions `600`.
- [ ] The startup log has no `[config]` lines, and `/healthz` shows the version you meant to deploy.
- [ ] Responses carry `Strict-Transport-Security` and `Content-Security-Policy`.
- [ ] `NOX_RPC_URL` points at your own node or one you trust (or is `off`), and the app shows no Ethereum node errors.
- [ ] `PLAN_TREASURY` is unset, unless you deliberately charge for Nil Pro. If set: the address, prices and trial are right, the NOX price bounds and fallback are set, and each server sharing the treasury has its own `PLAN_INVOICE_SLOT` and the shared `PLAN_INVOICE_KEY`.
- [ ] `REWARD_TOKENS` matches your chain.
- [ ] You created the workspace, the name is final, and you linked a second wallet.
- [ ] `APP_URL` is the address you'll keep. Changing it later means everyone restores their encryption keys from a recovery kit or starts over.
- [ ] There is a second admin, ideally a second owner.
- [ ] Sharing, token-holder door, voting power and zero-state settings are what you want.
- [ ] Nightly backups run, an encrypted copy leaves the server, and one restore was tested.
- [ ] A capsule is stored off-site with its passphrase in a password manager.
- [ ] If built-in AI is on, your team knows what goes to Anthropic and when.
- [ ] If you plan encrypted weighted votes: your team knows they are beta. The ballot circuit is not audited and its trusted setup in `circuits/CEREMONY.json` is a development ceremony. Rerun phase 2 with independent contributors ([circuits/CEREMONY.md](../circuits/CEREMONY.md)) before relying on them.
- [ ] The host installs security updates (for example `unattended-upgrades`). `docker-compose.yml` rotates Nil's own logs (5 files of 10 MB); rotate the other containers' logs too (`log-opts` in `/etc/docker/daemon.json`).
- [ ] If you use memory-only mode, swap is off or encrypted.

## 13. Troubleshooting

Start with the logs:

```bash
cd /opt/nonos
sudo docker compose ps
sudo docker compose logs --tail=100 nonos
sudo docker compose logs --tail=100 caddy
sudo docker compose exec nonos wget -qO- http://127.0.0.1:3000/healthz
```

### Caddy can't get a certificate

DNS doesn't point at the server yet, or ports 80 and 443 are blocked (check the provider's firewall too). Fix it and restart Caddy with `sudo docker compose restart caddy`. Many failed attempts in a row can hit Let's Encrypt rate limits, so wait before retrying.

### The container keeps restarting and the log says `APP_URL is required` or `NOX_RPC_URL is required`

Those two settings have no safe default. Set `APP_URL` to the address people type, and `NOX_RPC_URL` to your node (or `off`), then recreate the container.

### Lines with `[config]` in the log at startup

A setting in `.env` couldn't be used, or is risky in production. Each line names the setting and says what the server does instead: the default, community mode for an unusable `PLAN_TREASURY`, or a feature left off. Fix the value and recreate the container. With `STRICT_CONFIG=1` the server doesn't start until every one is fixed.

### "That setup token isn't right."

Use the token from the first start's log (or `/data/setup-token`), or the `SETUP_TOKEN` in `.env`. After an owner erases the workspace, the server prints a new one.

### "The database has schema …, but this version of Nil only knows up to …"

The image is older than the one that last ran on this volume. Run the newer release again, or restore the backup taken before the upgrade.

### The container keeps restarting with a permission or read-only error on `/data` or `./data`

`DATA_DIR` is set in `.env`; remove it. Or the volume's files belong to the wrong user after a manual copy: fix them with the `chown -R 1000:1000 /data` step from the restore section.

### "Request blocked. Reload the page and try again"

The browser's origin didn't match the server. People must use the address in `APP_URL`. Extra addresses, such as an onion address, go in `ALLOWED_ORIGINS`. The `Host` header the browser sends doesn't count.

### Live updates don't connect

Hovering over the dot next to the logo shows "Reconnecting…". The proxy must pass WebSocket upgrades on `/ws` (Caddy does) and the origin rules above apply.

### The wallet warns that the sign-in request doesn't match the site

`APP_URL` differs from the address in the browser bar.

### "First, a wallet" or "No wallet found"

The browser has no wallet. The sign-in screen explains how to get one. On a phone, open the site in a wallet's in-app browser.

### "This looks like a smart wallet"

Smart-contract wallets are checked on the chain in `NOX_CHAIN_ID` through `NOX_RPC_URL`. With `NOX_RPC_URL=off` they can't sign in. When the node is slow, raise `SIGNIN_CHAIN_TIMEOUT_SECONDS`.

### "No account here uses this wallet"

That wallet isn't linked to any account. Sign in with a linked wallet, or ask an admin for an invite.

### "Nil couldn't reach its Ethereum node"

`NOX_RPC_URL` is wrong, the node is down, or outbound HTTPS is blocked.

### "The Ethereum node is on chain …, but this server expects chain …"

`NOX_RPC_URL` points at a different network than `NOX_CHAIN_ID`.

### "NOX features are turned off on this server"

`NOX_RPC_URL` is `off`.

### A payment stays pending

It counts once its block is finalized, which on Ethereum usually takes under 15 minutes, and it's re-checked every minute. On a node without the `finalized` tag, `NOX_FINALITY_DEPTH` blocks are used instead. If the transaction never appears on-chain, it fails after `NOX_MISSING_TX_HOURS` (24 by default). A failed payment shows why (for example a sender that isn't the admin's wallet or a treasury address, or an amount without the digits Nil asked for). Fix the cause, remove the failed payment and pay again. A bounty payment that never gets mined can be cancelled and paid again.

### A Nil Pro payment isn't found

Nil matches a transfer to the treasury by its exact amount, so the amount must be sent as shown, last digits included. Some exchanges round withdrawals; such a payment can't be matched to an invoice. Paste the transaction hash under the invoice to see what Nil makes of it. If your node limits the range of one `eth_getLogs` request, lower `PLAN_LOG_BLOCKS`.

Nodes also stop answering for logs older than some depth: the public node at 10,000 blocks, about 33 hours. If the server or its node was down longer than that while an invoice was open, Nil skips the blocks it can no longer read, and the invoice lists them with a note to paste the hash of any payment sent in that time. A full node of your own usually serves all of history; set `NOX_LOG_HISTORY_BLOCKS` to match it and nothing is skipped.

### Errors saying Nil Pro is needed (HTTP 402)

`PLAN_TREASURY` is set and Nil Pro has run out, or the team has more people than the plan covers. Pay in **Settings → Plan**, or unset `PLAN_TREASURY` for community mode on your own server.

### "AI assist is off"

`ANTHROPIC_API_KEY` or `ANTHROPIC_MODEL` is not set (the startup log says which), or the container wasn't recreated after setting them.

### "This wallet doesn't unlock your keys yet"

The person set up their encryption keys with another wallet. They unlock once with that wallet and add this one under **Encryption keys** in **Settings → Sign-in & security**, or restore from their recovery kit. See [Signing in](signing-in.md#add-a-wallet-to-your-keys).

### "Your wallet's signature doesn't open your keys here"

The unlock messages changed since the person's keys were set up. Either `APP_URL` changed (set it back, or have each person restore from their recovery kit) or `DATA_DIR/keys` was replaced (restore it from backup; recovery kits don't help without it).

### "The server lists different keys for you than the ones your wallet unlocks"

The keys published for that person aren't the ones their wallet opens. That's expected if they started over with new keys on another device. If they didn't, look at what changed on the server before anyone confirms the new key.

### "Your wallet signs the same message differently each time"

That wallet can't hold encryption keys, because its signature is what opens them. It can still sign in. Use another linked wallet for the keys, such as MetaMask, Rabby, Ledger or Trezor.

### "That file is too large"

Raise `MAX_UPLOAD_MB`. For a capsule restore, raise `MAX_CAPSULE_MB`.

### "This server already has a workspace. Restore only works on a fresh install"

Capsules restore only into an empty volume. See the reset steps in section 8.

### "That ballot was refused: it was made for a different circuit"

`SEMAPHORE_DEPTH` doesn't match the circuit files in the image. Run `npm run zk:fetch` with the same depth, then rebuild.
