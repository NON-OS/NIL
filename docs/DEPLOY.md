# Deploying Nil in production

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

- **Size.** 2 vCPU, 2 GB RAM and 20 GB of SSD is a comfortable start for a team of a few dozen people. These are starting points, not measured limits. Building the Docker image on the server uses most of that memory. With 1 GB of RAM, add swap for the build (but see the note on swap in memory-only mode, [docs/ZERO-STATE.md](ZERO-STATE.md)).
- **One instance.** Nil uses SQLite, and keeps live updates and rate limits in memory. Run exactly one copy. Don't put it behind a load balancer with several replicas.
- **Software.** Docker Engine with the Compose plugin, version 2.24.4 or newer (the compose files use `!reset` and `!override`). Check with `docker compose version`. Install Docker from the official instructions at docs.docker.com/engine/install.
- **Outbound access.** The server needs HTTPS out to your Ethereum node, to Anthropic if you turn AI on, to Let's Encrypt for certificates, and to Docker Hub and the npm registry while building.
- **A wallet.** You sign in with an Ethereum wallet in your browser (an extension such as MetaMask or Rabby, or a wallet's in-app browser). Have one ready, plus a second wallet to link as a backup.

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

Docker writes its own firewall rules for published ports, and those skip ufw. That is why this guide never publishes Nil's port 3000 on the host. Only Caddy publishes ports.

## 4. Get the code

```bash
sudo git clone <your-nonos-repo-url> /opt/nonos
cd /opt/nonos
sudo git checkout <release>          # the release tag or branch you want to run
```

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
```

- `APP_URL` is required and must be exactly the address people type. Wallets show this domain in the sign-in message, and only this origin may make changes. Nil never reads it from the request, so a phishing site can't get a sign-in message that names its own domain. Without it, the server refuses to start.
- `TRUST_PROXY=uniquelocal` tells Nil to believe forwarded headers only from a private address, which is where Caddy reaches it on the Docker network. Without it, cookies lose the `Secure` flag and `__Host-` prefix, HSTS isn't sent, and rate limits see Caddy's address instead of the visitor's. A hop count (`1`) also works, but only while port 3000 is closed to everything except Caddy: anyone who reaches the port directly could otherwise claim any IP address. `true` is refused.
- `NOX_RPC_URL` is required on a server people reach over the network (see the table below), or `off`.
- `SOURCE_URL` is where people can get the source code you run, which the AGPL asks for.

Then decide on these:

| Variable | Recommendation |
|---|---|
| `NOX_RPC_URL` | Required. Your own Ethereum node (an execution client such as Geth, Nethermind or Reth, with a consensus client), or a provider you trust. The node sees every wallet and payout address your server looks up, and from which IP. Nil reads private-payout balances one address at a time at random moments, with other payees' addresses mixed in, and reads vote snapshots in a shuffled order a few wallets at a time, so a node can't group one person's addresses by timing. It can still tell that a snapshot's wallets were read together. Only your own node keeps every lookup to yourself. Use `off` if you don't want any on-chain features |
| `REWARD_TOKENS` | Leave the default (USDC on mainnet) or set `none` for NOX only. Change it if `NOX_CHAIN_ID` is not 1 |
| `PLAN_TREASURY` | Leave unset. The server then runs in community mode, with every tool unlocked. Set it only if you run NØNOS for others and charge them in NOX |
| `ANTHROPIC_API_KEY` | Only if you want built-in AI. Text goes to Anthropic only when someone clicks an AI button |
| `MAX_UPLOAD_MB` | Raise it if your team attaches large files (default 25) |

Don't set `DATA_DIR` in Docker. The image already uses `/data`, which is the `nonos-data` volume. Every variable is explained in [.env.example](../.env.example).

## 6. Add Caddy

Create two files next to `docker-compose.yml`. They belong to this server, not to the repository.

`/opt/nonos/Caddyfile`:

```
nonos.example.com {
	reverse_proxy nonos:3000
}
```

Caddy gets and renews the certificate, redirects HTTP to HTTPS, passes WebSocket connections through and sets the `X-Forwarded-*` headers Nil reads. It keeps no access log unless you add a `log` directive. To receive certificate expiry notices, add a global options block with your email at the very top of the file:

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
    depends_on:
      - nonos
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

**Prefer Caddy from your distribution's packages?** Then skip the `caddy` service, publish Nil on the loopback interface only, and point Caddy at it. Docker hands those connections to Nil from its own private network, so `TRUST_PROXY=uniquelocal` still fits:

```yaml
services:
  nonos:
    ports: !override
      - "127.0.0.1:3000:3000"
```

```
nonos.example.com {
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

The Nil container runs as an unprivileged user with a read-only root filesystem, no Linux capabilities and `no-new-privileges`. Only `/data` and `/tmp` are writable.

## 8. First sign-in and the first admin

Do this right after the first start. Until a workspace exists, anyone who reaches the server can create it, or restore a capsule into it.

1. Open `https://nonos.example.com`. You see **Set up your workspace**.
2. Enter the workspace name and your name. You can rename the workspace later in **Settings → Workspace**. People's encrypted-docs, private payout and voting keys don't depend on the name.
3. Click **Create workspace with your wallet** and sign the message. Check that the domain in the message is yours. You are now the **owner**.
4. Link a second wallet: **Settings → Sign-in & security → Your wallets**. Your wallets are your only way in. Nobody can add a wallet to your account for you.
5. Add at least one more admin, ideally a second owner: **Settings → Team → Invite people**, choose **Admin**, and send the link privately. Or change the role of an existing member under **Members**. Only an owner can make someone an owner.

If someone else set the workspace up before you, and there is nothing in it you need, reset it:

```bash
sudo docker compose rm -sf nonos
sudo docker volume rm nonos_nonos-data     # check the name with: docker volume ls
sudo docker compose up -d
```

Then review these settings:

- **Settings → Plan**: should say **Community mode**, unless you set `PLAN_TREASURY`.
- **Settings → Team → Sharing**: who can invite (admins only by default) and whether share links are allowed (off by default).
- **Settings → Team → Token holders**: the token-holder door is closed until you open it.
- **Settings → Team → Voting power**: the power per Zero-State Pass.
- **Settings → Data & privacy → Zero-state**: how long finished work, comments and history are kept (forever by default).
- **Bounties**: add treasury addresses (for example your Safe) if bounties are paid from one.

## 9. Optional: Tor onion service

Nil can also be reached as a Tor onion service. Details are in [docs/TOR.md](TOR.md). Since v3, a wallet is the only way to sign in, and Tor Browser ships without wallet extensions, so plan how your team will sign in first.

**Onion and HTTPS together.** When you pass `-f`, Compose stops loading the override file automatically, so list it:

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.tor.yml up -d --build
sudo docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.tor.yml exec tor cat /var/lib/tor/nonos/hostname
```

`docker-compose.tor.yml` removes Nil's published port. If your override publishes `127.0.0.1:3000` for a Caddy on the host, list the override after the Tor file so the port comes back.

Keep `APP_URL` set to your HTTPS address and add the onion address to `ALLOWED_ORIGINS` (`ALLOWED_ORIGINS=http://<your-address>.onion`). Onion visitors then see the onion address in the wallet sign-in message. All onion visitors reach Nil from the Tor container's address, so they share one set of rate limits.

**Onion only.** Skip Caddy and follow [docs/TOR.md](TOR.md): start once to create the address, then set `APP_URL=http://<your-address>.onion` and recreate the container. The Tor file already removes the published port, so the server answers only through Tor. Leave `TRUST_PROXY` empty. Back up the `tor-keys` volume to keep the onion address.

## 10. Backups

### What to back up

Everything Nil stores is in the `nonos-data` volume, mounted at `/data` in the container. With the code in `/opt/nonos`, the volume is called `nonos_nonos-data` (check with `docker volume ls`).

| Path in `/data` | What it is |
|---|---|
| `nonos.db`, `nonos.db-wal`, `nonos.db-shm` | The SQLite database. Don't copy these files while the server runs: use a snapshot (below) |
| `keys/receipts-ed25519.pem` | The workspace signing key. It signs receipts and is part of every person's key derivation. **Without it, the app can no longer re-derive anyone's docs, private payout or voting keys.** |
| `uploads/` | File attachments |

Also keep `/opt/nonos/.env`, `Caddyfile` and `docker-compose.override.yml`, and the `tor-keys` volume if you use Tor. Caddy's certificates are re-issued automatically and don't need a backup.

Backups hold everything in readable form: tasks (private ones too), comments, files and the signing key. Only docs stay encrypted. Encrypt backups before they leave the server, for example with `age`, `gpg` or `restic`.

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
rm -rf "$WORK"/restore-* "$WORK"/capsule-*

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

Start Nil on a server with an empty volume. Open the site, choose **Moving servers? Restore from an encrypted capsule**, pick the file and enter the passphrase. Everyone signs in again afterwards. Capsules larger than `MAX_CAPSULE_MB` (4096 by default) are refused.

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

- Database migrations run automatically when the server starts. They only go forward. To roll back, check out the previous release **and** restore the backup you took before upgrading.
- The app updates itself in open browsers on the next page load.
- After changing only `.env`, apply it with `sudo docker compose up -d --force-recreate nonos`.

**Upgrading from v2.** Version 3 removes email, password and passkey sign-in. The upgrade deletes every non-wallet sign-in method and the email column. Before upgrading, make sure every person, owners and admins first, has linked an Ethereum wallet to their account while still on v2. Anyone without a linked wallet can't sign in after the upgrade and has to be invited again as a new account.

**Upgrading from v1.** Version 1 had no wallet sign-in. Upgrade to v2 first, have everyone link a wallet, then upgrade to v3.

## 12. Pre-launch checklist

- [ ] `dig +short nonos.example.com` returns the server's address.
- [ ] `https://nonos.example.com` loads with a valid certificate, and `http://` redirects to it.
- [ ] Port 3000 is closed from the outside: `curl -m 5 http://<server-ip>:3000/healthz` from another machine fails.
- [ ] `.env` has `APP_URL`, `TRUST_PROXY` set to Caddy's address range (`uniquelocal`), `NOX_RPC_URL` and `SOURCE_URL`, no `DATA_DIR`, and permissions `600`.
- [ ] Responses carry `Strict-Transport-Security` and `Content-Security-Policy`.
- [ ] `NOX_RPC_URL` points at your own node or one you trust (or is `off`), and the app shows no Ethereum node errors.
- [ ] `PLAN_TREASURY` is unset, unless you deliberately charge for the plan. If set, the address, price and trial are right.
- [ ] `REWARD_TOKENS` matches your chain.
- [ ] You created the workspace, the name is final, and you linked a second wallet.
- [ ] There is a second admin, ideally a second owner.
- [ ] Sharing, token-holder door, voting power and zero-state settings are what you want.
- [ ] Nightly backups run, an encrypted copy leaves the server, and one restore was tested.
- [ ] A capsule is stored off-site with its passphrase in a password manager.
- [ ] If built-in AI is on, your team knows what goes to Anthropic and when.
- [ ] If you plan encrypted weighted votes: your team knows they are beta. The ballot circuit is not audited and its trusted setup in `circuits/CEREMONY.json` is a development ceremony. Rerun phase 2 with independent contributors (`scripts/zk-ballot.mjs`) before relying on them.
- [ ] The host installs security updates (for example `unattended-upgrades`), and Docker's logs are rotated (`log-opts` in `/etc/docker/daemon.json`).
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

**Caddy can't get a certificate.** DNS doesn't point at the server yet, or ports 80 and 443 are blocked (check the provider's firewall too). Fix it and restart Caddy with `sudo docker compose restart caddy`. Many failed attempts in a row can hit Let's Encrypt rate limits, so wait before retrying.

**Lines starting with `[config]` in the log at startup.** A setting in `.env` couldn't be used. Each line names the setting and says what the server does instead: the default, or community mode for an unusable `PLAN_TREASURY`. Fix the value and recreate the container.

**The container keeps restarting and the log says `APP_URL is required` or `NOX_RPC_URL is required`.** Those two settings have no safe default. Set `APP_URL` to the address people type, and `NOX_RPC_URL` to your node (or `off`), then recreate the container.

**The container keeps restarting with a permission or read-only error on `/data` or `./data`.** `DATA_DIR` is set in `.env`; remove it. Or the volume's files belong to the wrong user after a manual copy: fix them with the `chown -R 1000:1000 /data` step from the restore section.

**"Request blocked. Reload the page and try again."** The browser's origin didn't match the server. People must use the address in `APP_URL`. Extra addresses, such as an onion address, go in `ALLOWED_ORIGINS`. The `Host` header the browser sends doesn't count.

**Live updates don't connect (hovering the dot next to the logo shows "Reconnecting…").** The proxy must pass WebSocket upgrades on `/ws` (Caddy does) and the origin rules above apply.

**The wallet warns that the sign-in request doesn't match the site.** `APP_URL` differs from the address in the browser bar.

**"No wallet found."** The browser has no wallet extension. Install one, or open the site in a wallet's in-app browser.

**"No account here uses this wallet."** That wallet isn't linked to any account. Sign in with a linked wallet, or ask an admin for an invite.

**"Nil couldn't reach its Ethereum node."** `NOX_RPC_URL` is wrong, the node is down, or outbound HTTPS is blocked.

**"The Ethereum node is on chain …, but this server expects chain …"** `NOX_RPC_URL` points at a different network than `NOX_CHAIN_ID`.

**"NOX features are turned off on this server."** `NOX_RPC_URL` is `off`.

**A payment stays pending.** It counts after `NOX_CONFIRMATIONS` blocks (3 by default) and is re-checked every minute. If the transaction never appears on-chain, it fails after 24 hours. A failed payment shows why (for example a sender that isn't the admin's wallet or a treasury address). Fix the cause, remove the failed payment and record the transaction again.

**Errors saying Nil Pro is needed (HTTP 402).** `PLAN_TREASURY` is set and the plan has lapsed. Pay in **Settings → Plan**, or unset `PLAN_TREASURY` for community mode on your own server.

**"AI assist is off."** `ANTHROPIC_API_KEY` is not set, or the container wasn't recreated after setting it.

**"This wallet unlocks a different key than the one your docs are sealed to."** The person is using a different wallet than the one they first unlocked docs with, or `DATA_DIR/keys` was replaced (restore it from backup).

**"Your wallet signs the same message differently each time."** That wallet can't hold encryption keys. Use another wallet, such as MetaMask, Rabby, Ledger or Trezor.

**"That file is too large."** Raise `MAX_UPLOAD_MB`. For a capsule restore, raise `MAX_CAPSULE_MB`.

**"This server already has a workspace. Restore only works on a fresh install."** Capsules restore only into an empty volume. See the reset steps in section 8.

**"That ballot was refused: it was made for a different circuit."** `SEMAPHORE_DEPTH` doesn't match the circuit files in the image. Run `npm run zk:fetch` with the same depth, then rebuild.
