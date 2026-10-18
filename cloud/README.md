# Hosted Nil

This folder is the control plane NØNOS uses to host Nil for the public. Every workspace runs the normal Nil app in its own container, with its own data volume, its own network and hard resource limits. The control plane creates those containers, runs the sign-up page, routes each address to its container through Caddy, takes encrypted backups, watches health and upgrades workspaces one at a time.

Self-hosting stays free and unchanged: everything here is optional, and the app runs the same way on anyone's server. The scripts in [../deploy](../deploy) also set up a single self-hosted workspace (see [One self-hosted workspace](#one-self-hosted-workspace-with-the-same-scripts)).

A short version for the people using hosted workspaces is in [docs/hosted.md](../docs/hosted.md).

Contents: [What NØNOS can and cannot see](#what-nønos-can-and-cannot-see) · [How it works](#how-it-works) · [The server](#the-server) · [Go live, step by step](#go-live-step-by-step) · [Day two](#day-two) · [Operator CLI](#operator-cli) · [One self-hosted workspace](#one-self-hosted-workspace-with-the-same-scripts) · [Security notes](#security-notes) · [Development](#development)

## What NØNOS can and cannot see

NØNOS runs the server, so it is honest to start with what that gives it access to.

**Encrypted in the browser, unreadable to NØNOS**

- Docs: titles, text and their saved versions. The server stores ciphertext and the keys wrapped for each reader.
- Private tasks: title, notes, checklist and comments.
- The contents of encrypted ballots, and which member cast an anonymous vote.
- The keys for all of the above. They are derived in each person's browser from a wallet signature and never sent to the server.
- Wallet private keys and recovery phrases. They never leave the wallet.

**Stored in plain form in each workspace's own volume**

- Team tasks (titles, descriptions, checklists) and their comments.
- Files attached to tasks, goals, projects, labels, time entries and their notes, reminders, notification texts and the activity history.
- The member list: names, roles and the wallet addresses linked to accounts.
- Bounty records and payment references, vote metadata, the workspace's receipt signing key.
- For private tasks: that they exist, who created them, who they are assigned to, their status, dates, project and labels. For docs: who can read each one and when it changed.

NØNOS does not look at any of this, and the control plane is built so it never opens a workspace's database or files: it handles them only as an encrypted backup stream or as file names. But NØNOS has root on the server and holds the backup keys, so it is technically able to read everything in the list above, and could be compelled to hand it over. Docs and private tasks would only ever be handed over as ciphertext.

Root on the server would also let NØNOS send a changed web app that reads what people unlock. Every workspace runs the published image, and anyone can [check what a workspace sends](../docs/verify-a-server.md) against the release, byte for byte, from their own build of the source.

**What the control plane itself records**

- Per workspace: its address, the one wallet address that signed up (the owner), its state, app version, resource plan, creation, suspension and deletion dates, disk use, whether its setup was finished, and when its data last changed. That last one is the modification time of its database files, read without opening them, and decides when a workspace nobody uses is paused. A member count only if the app reports one in `/healthz`; it currently reports its version and database schema, nothing about people.
- Sign-ups waiting for approval: the address asked for, the wallet that signed, and the setup code it was given, until the operator approves or rejects it, or for `CLOUD_SIGNUP_REQUEST_DAYS`.
- At sign-up, the visitor's IP address is kept in memory for rate limiting and is never written to disk. The sign-up page sets no cookies, loads nothing from other sites and has no analytics.
- Its log names wallets only by a keyed hash, never IP addresses, and rotates by size.

**Network and third parties**

- Caddy sees every request's IP address and the address it asks for, as any web server does. It keeps no access log.
- With the default settings a workspace has no network route out at all. Its only connection is Caddy's relay to the Ethereum node, which sees the addresses and transactions the workspace looks up (for Nil Pro payments, bounties and votes). Run that node on the same server (see [docker-compose.chain.yml](docker-compose.chain.yml)) and those lookups never reach a third party.
- Nil Pro is paid on-chain inside each workspace, to the foundation's treasury. Payments are public on Ethereum like any transaction.
- Backups are encrypted on the server before they leave it. The storage provider sees only ciphertext, sizes and times, filed under random workspace ids rather than names.

**Deletion**

- `delete` takes a final encrypted backup, stops the workspace and erases it after a grace period (14 days by default). The owner's wallet address is then removed from the control database; the address stays reserved for 90 days so nobody else can pick it up. Backups expire after `CLOUD_BACKUP_KEEP_DAYS` (30 by default), the final one included.

## How it works

```
                  ┌──────────────────────── one server ─────────────────────────────┐
 browser ──443──▶ │ Caddy ─┬─▶ control plane :8080    sign-up page, "paused" notices │
                  │        │      │  Docker socket                                  │
                  │        │      └─▶ creates, watches, backs up, upgrades ──┐      │
                  │        ├─▶ nil-<id>:3000   workspace (own network, volume)│      │
                  │        ├─▶ nil-<id>:3000   workspace                      │      │
                  │        └── :8545 relay ──▶ Ethereum node (optional, reth) │      │
                  └───────────────────────────────────────────────────────────┼──────┘
                                     encrypted backups (ciphertext only) ◀────┘
                                     Storage Box or S3 bucket, another location
```

- One container per workspace, created through the Docker Engine API from the app image. Each has its own data volume, its own bridge network (so its own network namespace and no route to other workspaces), its own uid and gid (`CLOUD_APP_UID_BASE` plus its slot, 200000 and up, never the control plane's 1000; a short-lived helper hands the volume to that uid before the container starts), a read-only root filesystem with a small no-exec `/tmp`, no Linux capabilities, `no-new-privileges`, an init process, hard CPU, memory and process limits without swap, rotated logs and a health check on the app's own `/healthz`. The app inside is unmodified: the control plane only sets `APP_URL`, `TRUST_PROXY`, `PLAN_TREASURY` with each workspace's own invoice slot (`PLAN_INVOICE_SLOT`, `PLAN_INVOICE_KEY`), `SOURCE_URL`, `NOX_RPC_URL`, the plan's disk as the app's storage quota (`WORKSPACE_STORAGE_MB`) and a one-time `SETUP_TOKEN`; every other app setting comes from a shared `workspace.env`.
- Egress: with `CLOUD_EGRESS=rpc-only` (the default) workspace networks are Docker "internal" networks. Caddy is attached to each one, which makes it the only way in and, through its JSON-RPC relay, the only way out.
- Routing and TLS: the Caddyfile is generated from the control database. Running workspaces are proxied to their container, with WebSocket connections kept open across reloads; paused ones get a short notice; anything else is a 404. Certificates are either issued on demand, only for addresses the control plane confirms through its `ask` endpoint, or one wildcard certificate through a DNS challenge.
- Sign-up: the visitor picks an address, signs a Sign-In with Ethereum message the server wrote (it names the address), and the workspace is created. The page then shows the workspace's setup code exactly once. The app's own setup screen asks for it, so only the person who signed up can claim the workspace. Limits count per network (an IPv4 address or an IPv6 /56) and per block (/24 or /48), never in one budget shared by everyone, so one network can't close sign-ups for the rest. Wallet challenges are sealed tokens the server doesn't store, so a flood can't push out anyone else's. Past `CLOUD_SIGNUPS_PER_DAY`, or once the server is nearly full, a signed sign-up waits for the operator's approval; the person gets the setup code at once and the address opens when it is approved. A claimed workspace whose data hasn't changed in `CLOUD_IDLE_DAYS` is paused with a notice that gives the date it will be deleted.
- Upgrades: one workspace at a time. Each is stopped, its database checkpointed inside its own volume, started on the new image (which migrates the database) and health-checked. A failure puts the checkpoint back and starts the old image. The rollout stops after `CLOUD_UPGRADE_MAX_FAILURES` failures. The app also keeps its own `pre-migration-*.db` copies in the data folder; backups leave those out.
- Backups: nightly, one workspace after another. A consistent snapshot of the database (SQLite `VACUUM INTO`, taken inside the workspace) and its files are streamed straight into encryption (X25519 and AES-256-GCM, the way age does it), then to the target. The server holds public keys only.
- Health: Docker runs `/healthz` in every container; the control plane restarts a workspace that stays unhealthy, alerts the operator, and stops restarting one that keeps failing. It also alerts on a degraded RAID mirror, a nearly full disk, failed backups and failed upgrades.

Code layout:

```
config/       settings from CLOUD_* variables          runtime/     driver interface, Docker driver
db/ store/    the control database                     provisioning/ create, stop, upgrade, delete…
names/        address rules, reserved and blocked      routing/     Caddyfile, reload, TLS ask check
backups/      encryption, targets, S3 client           ops/         health, usage, alerts, schedule
signup/       sign-up flow, SIWE, limits, HTTP         cli/         the operator CLI
public/       the sign-up page                         test/        node --test cloud/test/
```

## The server

The service is sized for one Hetzner **EX63**: Intel Core Ultra 7 265 (20 cores), DDR5 ECC memory and NVMe drives. Order it with:

- 128 GB ECC RAM. 64 GB works without the Ethereum node; 128 GB leaves room for the node and plenty of page cache.
- 2 × 3.84 TB NVMe in RAID 1 (Linux software RAID, mdadm). One failed drive then costs nothing, and the datacenter swaps it while the server runs. About 3.5 TB is usable.
- Ubuntu 24.04 LTS, with the HWE kernel (`provision.sh --hwe-kernel`): the Core Ultra 200 series is better supported by newer kernels than 24.04's original 6.8.

**Memory budget (128 GB)**

| What | Memory |
|---|---|
| Ubuntu, Docker, Caddy, control plane | about 6 GB |
| Ethereum node, optional: Reth (24 GB limit) and Lighthouse (8 GB limit) | 32 GB |
| Page cache for databases and files (keeps them fast) | about 16 GB |
| Workspaces | about 74 GB |

A workspace's Nil process measured 85 to 120 MB resident, idle to lightly used (setup, sign-in, an encrypted export). Verifying zero-knowledge vote proofs and building large exports take more for a moment. Planning with 200 MB on average, 74 GB holds about **370 workspaces**, or about 500 without the Ethereum node. `CLOUD_MAX_WORKSPACES` defaults to 300 to keep a margin; raise it once `docker stats --no-stream` shows real numbers.

The per-container limits (768 MB for the standard plan, 1.5 GB for pro) are ceilings, not reservations, so their sum is far above the RAM. That is deliberate: almost all workspaces are idle at any moment. A single workspace can never use more than its limit, and if the whole server ever ran out, the kernel would stop the largest offender, not the host. Watch free memory and the over-disk alerts.

**CPU**: Nil's server is one Node process, so the standard plan's 1 core is its natural ceiling; pro gets 2. Idle workspaces use no CPU. **Disk**: with the node's 1.5 to 2 TB, about 1.4 TB is left for workspaces and images. Docker can't cap a volume, so a plan's disk (5 GB for standard) is enforced twice: the app gets it as its storage quota and refuses uploads past it, and a workspace that still grows past 120% of it (`CLOUD_DISK_SUSPEND_PERCENT`) is suspended with a critical alert and a notice on its address. At 300 workspaces that is room for the worst case. The control plane alerts when less than 15% of the disk is free.

## Go live, step by step

The examples use `nil.example` for the hosted domain, `203.0.113.10` and `2001:db8::10` for the server's addresses, and `deploy` for the deploy user. Replace them with yours.

### 1. Install the server

In Hetzner's Robot, boot the server into the rescue system and run `installimage`. Choose Ubuntu 24.04, keep `SWRAID 1` and `SWRAIDLEVEL 1` (RAID 1 over both NVMe drives), keep a `/boot` partition and give the rest to one ext4 root partition `/`; leave swap out. The server runs without swap, so nothing in memory (setup codes, keys, a backup key brought in for a restore) is ever written to the disk in the clear; with 128 GB and hard limits on every container it doesn't need any. Add your SSH public key when asked, then reboot into the new system and log in as root with your key.

### 2. DNS

Create these records at your DNS provider:

| Name | Type | Value | For |
|---|---|---|---|
| `nil.example` | A | `203.0.113.10` | the sign-up page |
| `nil.example` | AAAA | `2001:db8::10` | the same over IPv6 (Hetzner assigns a /64 per server) |
| `*.nil.example` | A | `203.0.113.10` | every workspace |
| `*.nil.example` | AAAA | `2001:db8::10` | every workspace over IPv6 |
| `nil.example` | CAA | `0 issue "letsencrypt.org"` and `0 issue "sectigo.com"` | only Let's Encrypt and ZeroSSL (Caddy's two CAs) may issue |

Set the server's reverse DNS in Robot to `nil.example` as well. Check from your own machine before going on: `dig +short nil.example` and `dig +short anything.nil.example` must both return the server.

Pick the TLS mode now, and for a public launch pick wildcard. **Wildcard** gets one certificate for every workspace through a DNS challenge. It needs an API token from your DNS provider and a Caddy build with its module (step 5). **On demand** (the default) needs nothing more, but each new workspace needs its own certificate and Let's Encrypt issues at most 50 per registered domain per week. Anyone can sign up a few dozen throwaway workspaces and use them up, and real workspaces then have no certificate until the week is over (Caddy can fall back to ZeroSSL, which is why the CAA records allow it too). On demand is fine for a private test server.

### 3. Provision

From your own machine, in a checkout of this repository:

```bash
scp -r deploy root@203.0.113.10:/root/nil-deploy
ssh root@203.0.113.10 /root/nil-deploy/provision.sh --mode hosted --hwe-kernel \
  --hostname nil-1 --ssh-key-file /root/.ssh/authorized_keys --with-chain
```

Leave out `--with-chain` if you won't run the Ethereum node. Add `--auto-reboot 04:30` if kernel updates may reboot the server by themselves at that UTC time. Run it with `--dry-run` first to see every change it would make.

What it does, each step only if needed: checks the RAID arrays and warns about a degraded or syncing one; installs all updates; creates the `deploy` user with your keys and no password, as uid 1500 (`--deploy-uid`), a uid no container uses; turns SSH into keys only with root logins off (it refuses if `deploy` has no key, so you can't lock yourself out); lets only 22, 80 and 443 through ufw; sets up fail2ban, unattended security upgrades (Ubuntu's and Docker's own repository, with `live-restore` keeping containers up while the engine restarts), time sync, Docker Engine from Docker's own repository with a hardened `daemon.json`, kernel and network tuning, journald and logrotate limits; and creates `/opt/nil`. It sets up no swap, and warns about swap that isn't on an encrypted device (`--swap-gb` creates an unencrypted swap file if you want one anyway).

Before closing the root session, check from a second terminal that `ssh deploy@203.0.113.10` works. Reboot if it says so (for the HWE kernel): `sudo reboot`.

### 4. Backup storage and keys

Backups go to a different location from the server: a Hetzner **Storage Box** (BX11 or larger) in another datacenter (server in Falkenstein, box in Helsinki, say), or an S3-compatible bucket such as Hetzner Object Storage.

**Storage Box.** In Robot, enable Samba/CIFS for the box and create a sub-account for this server. On the server:

```bash
sudo install -m 600 /dev/null /etc/nil-storagebox.cred
sudo tee /etc/nil-storagebox.cred > /dev/null << 'EOF'
username=u123456-sub1
password=the-sub-account-password
EOF
echo '//u123456-sub1.your-storagebox.de/u123456-sub1 /mnt/nil-backups cifs credentials=/etc/nil-storagebox.cred,uid=1000,gid=1000,file_mode=0600,dir_mode=0700,seal,vers=3.1.1,_netdev,nofail 0 0' | sudo tee -a /etc/fstab
sudo mount /mnt/nil-backups
touch /mnt/nil-backups/.nil-backup-target
```

`uid=1000` is the control plane's user inside its container. `seal` encrypts the SMB traffic as well; the backups are encrypted either way. The `.nil-backup-target` file tells the control plane the share is mounted: if the mount ever drops, the folder underneath is empty, and backups stop with an alert instead of filling the server's own disk. At boot Docker waits for the share (provision.sh adds `Wants=` and `After=` for its mount unit to `docker.service`, without making Docker depend on it), and the control plane mounts the folder with `rslave` propagation, so a share that mounts late, or again after a drop, still reaches it. In `cloud.env` use `CLOUD_BACKUP_TARGET=file:///backups`. Old backups are pruned after `CLOUD_BACKUP_KEEP_DAYS`.

The server can delete whatever it can write on the share, so someone who took it over could delete every backup. Turn on the Storage Box's snapshots in Robot (an automatic snapshot plan, daily, keeping at least 30): Hetzner takes them, the sub-account on the server can read them under `.zfs/snapshot` but can't change or delete them, and only the main account in Robot can. Keep the Robot login and its API credentials off the server.

**S3 instead.** Create a bucket in another location with versioning and Object Lock turned on (Object Lock can only be turned on when the bucket is created), and give it a default retention in compliance mode of at least 30 days (`CLOUD_BACKUP_KEEP_DAYS`). Add a lifecycle rule that expires current objects after 30 days and noncurrent versions after one day; locked versions stay until their retention ends either way. Then set in `cloud.env`: `CLOUD_BACKUP_TARGET=s3://nil-backups/hosted`, `CLOUD_S3_ENDPOINT=https://hel1.your-objectstorage.com`, `CLOUD_S3_REGION=hel1` and the key pair. The control plane never deletes from a bucket, but a key that can write can also overwrite, and a stolen key can do whatever the provider lets it. Versioning keeps the old copy of anything overwritten, and compliance mode means no key, the server's included, can delete a version before its retention ends. Where the provider allows narrower keys, the server's key needs to put objects, abort its own uploads, read objects (for restores) and read the bucket's versioning and Object Lock settings, and nothing else. At startup the control plane reads those settings and alerts when versioning is off or the retention is shorter or not in compliance mode.

**Keys.** On your own machine, not the server, with Node 22 and this repository:

```bash
cd cloud && npm ci
node cli.js keygen --out ~/nil-backup-alice.key
```

It prints a public key (`nilbk-pub-…`) and writes the secret key to the file. Make a second pair for a second person. Put both public keys, comma separated, in `CLOUD_BACKUP_RECIPIENTS`; either secret key can then restore any backup. Keep the secret keys offline (a password manager and a printed copy), never on the server.

### 5. First release

On your own machine, from a clean checkout of the release you want to run:

```bash
deploy/release.sh --host deploy@203.0.113.10
```

It builds the app and control plane images, writes their SBOMs and a `SHA256SUMS` file, copies everything to `/opt/nil/releases/<version>`, checks the checksums on the server, loads the images and installs the scripts and compose files. Nothing starts yet. It builds from the committed tree (`git archive` of `HEAD`), so a file you haven't committed never ships and the web app is exactly the release anyone can rebuild. For wildcard TLS add `--caddy-dns-module github.com/caddy-dns/hetzner@v1.0.0` (your provider's module, always with a version) and set `CADDY_IMAGE=localhost/nonos/nil-caddy:2.10.2-dns` in `/opt/nil/.env`. The module's `go.mod` names the Caddy it needs: pick a version made for Caddy 2.10, or move the Caddy images in `cloud/caddy/Dockerfile` to a newer Caddy along with it.

The images are named `localhost/nonos/nil` and `localhost/nonos/nil-cloud`. The `localhost/` prefix means Docker never looks for them on Docker Hub, where `nonos/nil` would be whatever the owner of the `nonos` account put there. Nothing on the server pulls them: the compose files say `pull_policy: never`, the control plane's `CLOUD_IMAGE_PULL` is `never`, and the deploy scripts check that the version they would fall back to is still on the server before they change anything. A restore onto a new server runs the image named in the backup only if it is ours and already there, and otherwise the current one. To ship through a registry instead, pass `--registry` with a registry the foundation controls, set `NIL_IMAGE` and `NIL_CLOUD_IMAGE` in `/opt/nil/.env` to the names there, and set `CLOUD_IMAGE_PULL=missing` only if workspaces should pull from it. A server set up before this change gets the new names from `install.sh`, which also gives the images already there the new names.

### 6. Configure

On the server, in `/opt/nil`:

- `cloud.env` (created from [.env.example](.env.example), every setting explained there). At least: `CLOUD_DOMAIN`, `CLOUD_ACME_EMAIL`, `CLOUD_CONTACT`, `CLOUD_TERMS_URL`, `CLOUD_PRIVACY_URL`, `CLOUD_IMPRINT_URL` (a service run from Germany or Finland needs an imprint and a privacy policy), `CLOUD_SOURCE_URL` (the AGPL asks a hosted service to offer its source), `CLOUD_PLAN_TREASURY` (the foundation's treasury, for Nil Pro) with `CLOUD_INVOICE_KEY` (a long random secret, so no two workspaces ask for the same amount), `CLOUD_RPC_URL` (`http://reth:8545` with the node), `CLOUD_BACKUP_RECIPIENTS`, `CLOUD_BACKUP_TARGET` and `CLOUD_ALERT_WEBHOOK`. For wildcard TLS: `CLOUD_TLS=wildcard` and `CLOUD_DNS_PROVIDER`.
- `workspace.env` (from [workspace.env.example](workspace.env.example)): the app settings every workspace shares, such as the Nil Pro price and trial. See the root [.env.example](../.env.example) for all of them.
- `.env`: `NIL_VERSION` is already set. For wildcard TLS add `DNS_API_TOKEN`. For the Ethereum node uncomment `COMPOSE_FILE` and set `RETH_IMAGE` and `LIGHTHOUSE_IMAGE` to the clients' current stable tags.

### 7. Start

```bash
/opt/nil/deploy/upgrade.sh <version>
```

On the first run it smoke-tests the image (a throwaway workspace: health, sign-in page, setup with a throwaway wallet, the proof verifier and an encrypted export), then starts the control plane and Caddy. Check:

```bash
cd /opt/nil && docker compose ps            # control and caddy healthy
curl -sI https://nil.example | head -n 1    # HTTP/2 200 once the certificate is issued
docker compose logs --tail 50 control
```

The control plane refuses to start on a bad setting and lists every problem at once in its log. With the Ethereum node, the first sync takes a day or more; until then, workspaces can't check payments.

### 8. The foundation's own workspace

`nonos` is a reserved address; the operator can still use it:

```bash
docker compose exec control node cli.js create nonos --owner 0xYourFoundationWallet --plan pro --any-name
```

It prints the setup code once. Open `https://nonos.nil.example`, enter the code, and create the workspace with that wallet. Then, inside it: link a second wallet, invite a second admin, and look at Settings → Plan.

### 9. Check backups and a restore

Don't launch before one restore has worked.

```bash
docker compose exec control node cli.js backup --all     # every workspace, the control database, pruning
ls -R /mnt/nil-backups | head
```

Copy one workspace backup to your own machine and check it there, where the secret key is:

```bash
scp deploy@203.0.113.10:/mnt/nil-backups/workspaces/<id>/<file>.nilbackup .
node cloud/cli.js verify-backup <file>.nilbackup --identity ~/nil-backup-alice.key
```

It decrypts the whole backup, checks every chunk and the archive's structure, and writes nothing. Then do a restore drill on the server: the backup goes into a throwaway workspace that is never routed, has no network at all and is removed afterwards, and has to start and pass its health check. This is the one time the secret key goes there. Stream it from your machine over SSH into the control plane's `/tmp`, which lives in memory and is never swapped out, so the key never touches the server's disk, and remove it afterwards:

```bash
# on your machine
ssh deploy@203.0.113.10 'cd /opt/nil && docker compose exec -T control sh -c "umask 077 && cat > /tmp/k"' < ~/nil-backup-alice.key
# then on the server, in /opt/nil
docker compose exec control node cli.js restore-drill /backups/workspaces/<id>/<file>.nilbackup --identity /tmp/k
docker compose exec control rm /tmp/k
```

Don't drill with `restore` into a new name: that creates a real workspace, and the copy of a customer's data would be online at its address.

### 10. Monitoring and alerts

- `CLOUD_ALERT_WEBHOOK` receives every alert (restarts, failed upgrades and backups, a degraded RAID, a full disk). Test it: `docker compose exec control node cli.js alert-test`.
- The control plane can't report its own server being down. Add an outside check of `https://nil.example` and of one workspace's `https://nonos.nil.example/healthz`, from another machine or an uptime service, and turn on Robot's server monitoring.
- `smartd` watches the NVMe drives and logs to the journal; the control plane watches the RAID arrays.

### 11. Go-live checklist

- [ ] `dig` returns the server for `nil.example` and `*.nil.example`, IPv4 and IPv6; CAA records set.
- [ ] `https://nil.example` loads with a valid certificate; `http://` redirects to it.
- [ ] `CLOUD_TLS=wildcard`, and a new workspace's address gets the wildcard certificate.
- [ ] The terms say that sign-ups may wait for approval, and that unused workspaces are paused and later deleted (`CLOUD_UNCLAIMED_DAYS`, `CLOUD_IDLE_DAYS`, `CLOUD_IDLE_NOTICE_DAYS`).
- [ ] From outside, only 22, 80 and 443 answer: `nmap -Pn 203.0.113.10`.
- [ ] SSH works for `deploy` with a key and refuses passwords and root. `id -u deploy` isn't 1000.
- [ ] `/proc/mdstat` shows `[UU]` for every array.
- [ ] `cloud.env` has the domain, contact, terms, privacy and imprint links, source URL, treasury and invoice key, RPC URL, backup recipients and target, and alert webhook; `docker compose logs control` shows no `[config]` warning you didn't expect.
- [ ] The foundation's workspace exists, has a second wallet and a second admin.
- [ ] A test sign-up from a phone wallet worked end to end, and the setup code was accepted.
- [ ] `backup --all` succeeded, `verify-backup` passed on your machine, and a restore drill worked.
- [ ] Both backup secret keys are stored offline by two people.
- [ ] The backups survive a compromised server: Storage Box snapshots are on in Robot, or the bucket has versioning and compliance-mode Object Lock (no `backup.target_unprotected` alert at startup).
- [ ] `alert-test` arrived; outside uptime checks are on.
- [ ] With the Ethereum node: it is synced (`docker compose logs reth` shows new blocks), and a workspace's Settings → Plan shows no node error.
- [ ] Unattended upgrades are on (`systemctl status unattended-upgrades`), and someone owns the monthly reboot.

## Day two

**Upgrading Nil.** Read the changelog. On your machine: `deploy/release.sh --host deploy@203.0.113.10`. On the server: `/opt/nil/deploy/upgrade.sh <version>`. It smoke-tests the new image, moves the control plane (new sign-ups get the new version from then on), then upgrades every running workspace one at a time and rolls back any that fail their health check; the log is in `/var/log/nil/upgrade.log`. Stopped and suspended workspaces keep their version until resumed; `cli.js upgrade <name> --image …` moves them then. To go back afterwards, `/opt/nil/deploy/rollback.sh` restores each workspace's pre-upgrade checkpoint (kept 7 days) and the previous control plane. Everything written since the upgrade is lost, which is why it asks.

**Changing settings.** After editing `cloud.env`: `docker compose up -d control`. If the change affects workspaces (treasury, RPC URL, anything in `workspace.env`): `docker compose exec control node cli.js refresh --all`, which recreates them one at a time.

**Every week.** `cli.js list` (state, disk, last backup of every workspace), `df -h`, `cat /proc/mdstat`, and a look at the alert channel.

**Every month.** Reboot in a quiet hour if `/var/run/reboot-required` exists (workspaces are down for a minute or two; they all come back by themselves). Docker updates itself with the security updates; check `/var/log/unattended-upgrades/unattended-upgrades.log` that it did. Update Caddy: set a newer `CADDY_IMAGE`, with its digest (`docker buildx imagetools inspect caddy:<version>` shows it), then `docker compose up -d caddy` and `docker compose exec control node cli.js routes` to reconnect it to the workspace networks. Do a restore drill (`restore-drill`, step 9).

**Abuse.** `cli.js suspend <name> --reason "<ticket>"` takes a workspace offline with a notice and keeps its data; `resume` brings it back. For illegal content, `cli.js delete <name> --now` (it still takes a final encrypted backup unless `--no-export`). Add recurring bad words to a `CLOUD_BLOCKLIST_FILE`. Sign-ups are limited per network and per block (see `.env.example`), so a flood from one provider stops at its own share.

**Capacity.** Past `CLOUD_SIGNUPS_PER_DAY` new workspaces in a day, or once `CLOUD_APPROVAL_ABOVE_PERCENT` of `CLOUD_MAX_WORKSPACES` is in use, sign-ups wait for approval and an alert says so: `cli.js requests` lists them, `cli.js approve <name>` creates and starts one (its owner already has the setup code), `cli.js reject <name>` frees the address. Sign-ups close by themselves at `CLOUD_MAX_WORKSPACES`. A workspace nobody set up is removed after `CLOUD_UNCLAIMED_DAYS`; a claimed one whose data hasn't changed in `CLOUD_IDLE_DAYS` is paused with a notice and deleted `CLOUD_IDLE_NOTICE_DAYS` later unless its owner asks for it back (`resume`), so put both in the terms. When memory or disk runs short, raise plans for the busy few (`cli.js resize <name> pro`) or plan a second server; workspaces move between servers with `backup` and `restore`.

**Backup keys.** To rotate, add the new public key to `CLOUD_BACKUP_RECIPIENTS`, restart the control plane, and keep the old secret key until the last backup made for it has expired.

**Disaster recovery.** On a new server: provision, release, configure with the same `cloud.env`, start. Then restore each workspace from its latest backup: bring a secret key into the control plane's `/tmp` as in step 9, and `cli.js restore <name> <file> --identity /tmp/k` recreates a workspace this control plane has never seen from the manifest inside the backup (owner and plan; the image only if it is ours and already on the server, otherwise the current one). Remove the key when you are done. The encrypted control database backups (`control/` in the target) hold the history as well; `cli.js decrypt` turns one back into a database file.

## Operator CLI

Run it in the control plane's container: `docker compose exec control node cli.js <command>`. On your own machine, `keygen`, `decrypt` and `verify-backup` of a local file work without any server settings.

| Command | What it does |
|---|---|
| `list [--state s] [--json]` | every workspace: state, plan, image, dates, disk, owner (shortened), last backup |
| `info <name>` | details, app version, recent backups and history of one workspace |
| `create <name> --owner 0x… [--plan p] [--image i] [--any-name]` | create and start a workspace; prints its setup code |
| `start <name>`, `resume <name>` | start a stopped or suspended workspace, cancel a deletion, or retry a failed creation |
| `stop <name>`, `suspend <name> [--reason r]` | take it offline, keeping its data |
| `resize <name> <plan>`, `refresh <name…>\|--all` | recreate containers with a new plan or the current settings |
| `upgrade <name…>\|--all --image i [--max-failures n]` | rolling upgrade with checkpoints and automatic rollback |
| `rollback <name…>\|--all [--yes]` | back to the pre-upgrade checkpoint |
| `delete <name> [--now] [--no-export] [--yes]` | final encrypted export, then deletion after the grace period |
| `requests`, `approve <name>`, `reject <name>` | sign-ups waiting for approval; create one, or free its address |
| `backup <name…>\|--all` | encrypted backup now; `--all` is the nightly job |
| `restore <name> <file> --identity k [--owner 0x…]` | replace a workspace's data, or recreate it, from a backup |
| `restore-drill <file> --identity k` | restore into a throwaway workspace nobody can reach, check it starts, remove it |
| `verify-backup <file> --identity k` | decrypt and check a backup without writing anything |
| `decrypt <file> --identity k --out f` | write a backup's plaintext to a new private file |
| `keygen --out f` | a new backup key pair |
| `routes [--print]` | rewrite and reload the Caddy configuration, reconnect Caddy to every network |
| `check` | run the health, disk, RAID, usage and claim checks now |
| `setup-token <name>` | show the setup code of a workspace nobody has claimed yet |
| `alert-test` | send a test alert |

Destructive commands ask for the workspace name to be typed back; `--yes` skips that in scripts.

## One self-hosted workspace with the same scripts

For a team that runs Nil on its own server, the same scripts set up one workspace behind Caddy, without the control plane:

```bash
scp -r deploy root@SERVER:/root/nil-deploy
ssh root@SERVER /root/nil-deploy/provision.sh --mode single --ssh-key-file /root/.ssh/authorized_keys
deploy/release.sh --mode single --host deploy@SERVER          # on your machine
```

On the server, fill in `/opt/nil/.env` (`NIL_DOMAIN`, `ACME_EMAIL`) and `/opt/nil/nil.env` (the app's settings; see [docs/DEPLOY.md](../docs/DEPLOY.md)), point the domain's A and AAAA records at the server, then run `/opt/nil/deploy/upgrade.sh <version>`. Later upgrades work the same way: the database is checkpointed, the new version started, and if `/healthz` doesn't come up the checkpoint is put back and the old version started again. `rollback.sh` goes back by hand. Backups for a single workspace are described in [docs/DEPLOY.md](../docs/DEPLOY.md#10-backups).

## Security notes

- The control plane is as powerful as root. It holds the Docker socket because creating containers needs it. Its own container is read-only, without capabilities, and publishes no port; its sign-up site is reached only through Caddy, and the TLS `ask` endpoint is on a separate port that is never published or proxied. Treat the `deploy` user's SSH key the same way: the docker group is root-equivalent.
- No uid is shared between a container and an account on the host. The control plane runs as 1000 (the image's `node` user), each workspace as its own uid from 200000 up, and `deploy` as 1500, so someone who broke out of a container would not be `deploy`, with its sudo and docker group. A server provisioned before this has `deploy` at 1000: `provision.sh` warns, and `--move-deploy-uid`, run as root from a session that isn't `deploy`'s, moves it (Nil stops for about a minute). To get a root session, run `provision.sh --keep-root-login` first, or use Robot's console, then run it once more without that option.
- Isolation between workspaces comes from separate network namespaces and networks, per-container limits, a read-only root, no capabilities and `no-new-privileges`, plus Docker's default seccomp and AppArmor profiles. What a compromised workspace can reach: Caddy (as anyone on the internet can) and the RPC relay. Not other workspaces, not the control plane, not the internet.
- Not done, on purpose. Docker user namespaces (`userns-remap`) would add a layer but complicate volume ownership for the app and its backups; gVisor or Kata would add more at a performance cost. Both can be layered on later through the driver interface.
- Secrets on the server: `cloud.env` (S3 keys, the alert token, and `CLOUD_INVOICE_KEY`, which every workspace also gets in its environment), `/opt/nil/.env` (the DNS token for wildcard TLS), `/etc/nil-storagebox.cred`, the generated Caddyfile (the RPC node's credentials, if its URL carries any), the Ethereum node's engine API secret in `chain/jwt.hex`, the key that hashes wallet addresses in the control plane's log, setup codes until a workspace is claimed (in the control database, and in the workspace's environment, which `docker inspect` shows), the setup codes of sign-ups waiting for approval, and each workspace's data, its receipt signing key included. The backup secret keys are not kept there: a restore brings one in over SSH into the control plane's memory-only `/tmp` and removes it afterwards. Nothing is swapped to disk: the server has no swap, and the control plane, Caddy and every workspace have memory limits that leave swap out.
- Supply chain: the control plane has four dependencies (two fonts and `@noble/curves` and `@noble/hashes`, which the app already uses), pinned in `package-lock.json`. The Docker and S3 clients, the backup encryption and the tar handling use only Node's standard library. Every base image is pinned by digest (Node in both Dockerfiles, Caddy and its builder, Debian for Tor, and the Dockerfile frontend), the Caddy DNS module by version, and `release.sh` builds from the committed tree only. The Ethereum clients are the exception: their tags are set in `.env` and have to follow the clients' releases.

## Development

```bash
cd cloud && npm ci && cd ..
node --test cloud/test/          # from the repository root; about 3 seconds
```

The tests run every operation against an in-memory fake runtime and a fake Docker Engine on a unix socket, so no Docker is needed. To try the sign-up page locally:

```bash
CLOUD_DOMAIN=nil.localhost CLOUD_APP_IMAGE=localhost/nonos/nil:dev CLOUD_RPC_URL=off CLOUD_EGRESS=open \
CLOUD_DATA_DIR=/tmp/nil-cloud node cloud/index.js      # then open http://localhost:8080
```

Wallet signing in the browser needs HTTPS or localhost.
