#!/usr/bin/env bash
# Prepares a fresh Ubuntu 24.04 server for Nil: hosted (the control plane and one container per
# workspace) or single (one self-hosted workspace). Safe to run again: each step checks first
# and changes only what isn't right yet.
#
#   scp -r deploy root@SERVER:/root/nil-deploy
#   ssh root@SERVER /root/nil-deploy/provision.sh --mode hosted --ssh-key-file /root/.ssh/authorized_keys
#
# cloud/README.md walks through it step by step.
set -Eeuo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy/lib.sh
. "$HERE/lib.sh"
trap 'log "stopped at line $LINENO: $BASH_COMMAND"' ERR

MODE=hosted
DEPLOY_USER=deploy
# Not 1000: the control plane runs as uid 1000 inside its container (the node user), and
# workspaces as 200000 and up. Someone who broke out of a container must not land in an account
# with sudo and the docker group.
DEPLOY_UID=1500
MOVE_DEPLOY_UID=0
SSH_KEYS=()
# No swap by default: what is in memory (setup codes, keys, a restore's backup key in the
# control plane's /tmp) would otherwise be written to the disk unencrypted. The containers have
# hard memory limits without swap either way.
SWAP_GB=0
NEW_HOSTNAME=
AUTO_REBOOT=
HWE=0
WITH_CHAIN=0
KEEP_ROOT=0
ALLOW_OTHER_OS=0
ADDRESS_POOL=10.200.0.0/16
BACKUP_DIR=/mnt/nil-backups

usage() {
  cat << 'EOF'
Usage: provision.sh [options]

  --mode hosted|single     hosted Nil (default) or one self-hosted workspace
  --deploy-user NAME       the non-root user that deploys and runs Docker (default: deploy)
  --deploy-uid N           its uid and gid, one no container uses (default 1500)
  --move-deploy-uid        move an existing deploy user off uid 1000; stops Nil for a minute,
                           and must run as root from a session that isn't the deploy user's
  --ssh-key "KEY"          a public key for that user (repeatable)
  --ssh-key-file FILE      public keys for that user, one per line (default: root's keys)
  --swap-gb N              create an unencrypted swap file of N GB if there is no swap (default 0: none)
  --hostname NAME          set the host name
  --auto-reboot HH:MM      reboot automatically at this UTC time when an update needs it
  --hwe-kernel             install Ubuntu's newer HWE kernel (recommended for Intel Core Ultra)
  --with-chain             prepare for the optional Ethereum node (docker-compose.chain.yml)
  --keep-root-login        keep key-only root logins over SSH (default: root can't log in)
  --docker-pool CIDR       address pool for Docker networks (default 10.200.0.0/16)
  --backup-dir PATH        where the backup share is mounted (default /mnt/nil-backups)
  --allow-other-os         run on something other than Ubuntu 24.04
  --dry-run                print what would change without changing anything
EOF
}

while [ $# -gt 0 ]; do
  case $1 in
    --mode) MODE=$2; shift 2 ;;
    --deploy-user) DEPLOY_USER=$2; shift 2 ;;
    --deploy-uid) DEPLOY_UID=$2; shift 2 ;;
    --move-deploy-uid) MOVE_DEPLOY_UID=1; shift ;;
    --ssh-key) SSH_KEYS+=("$2"); shift 2 ;;
    --ssh-key-file) mapfile -t -O "${#SSH_KEYS[@]}" SSH_KEYS < <(grep -E '^(ssh-|ecdsa-|sk-)' "$2"); shift 2 ;;
    --swap-gb) SWAP_GB=$2; shift 2 ;;
    --hostname) NEW_HOSTNAME=$2; shift 2 ;;
    --auto-reboot) AUTO_REBOOT=$2; shift 2 ;;
    --hwe-kernel) HWE=1; shift ;;
    --with-chain) WITH_CHAIN=1; shift ;;
    --keep-root-login) KEEP_ROOT=1; shift ;;
    --docker-pool) ADDRESS_POOL=$2; shift 2 ;;
    --backup-dir) BACKUP_DIR=$2; shift 2 ;;
    --allow-other-os) ALLOW_OTHER_OS=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage; die "Unknown option: $1" ;;
  esac
done

case $MODE in hosted | single) ;; *) die "--mode must be hosted or single." ;; esac
[[ $DEPLOY_USER =~ ^[a-z_][a-z0-9_-]{0,31}$ ]] || die "--deploy-user must be a plain Unix user name."
if ! [[ $DEPLOY_UID =~ ^[0-9]+$ ]] || [ "$DEPLOY_UID" -le 1000 ] || [ "$DEPLOY_UID" -ge 60000 ]; then
  die "--deploy-uid must be a whole number from 1001 to 59999 (1000 is the uid inside Nil's containers)."
fi
[[ $SWAP_GB =~ ^[0-9]+$ ]] || die "--swap-gb must be a whole number."
[ -z "$AUTO_REBOOT" ] || [[ $AUTO_REBOOT =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || die "--auto-reboot must be HH:MM."
[[ $ADDRESS_POOL =~ ^[0-9.]+/[0-9]+$ ]] || die "--docker-pool must be a CIDR such as 10.200.0.0/16."
[ "$(id -u)" = 0 ] || [ "$DRY_RUN" = 1 ] || die "Run this as root."

# shellcheck source=/dev/null
. /etc/os-release
if [ "${ID:-}" != ubuntu ] || [ "${VERSION_ID:-}" != 24.04 ]; then
  [ "$ALLOW_OTHER_OS" = 1 ] || die "This is ${PRETTY_NAME:-an unknown system}; the script is written for Ubuntu 24.04. Pass --allow-other-os to try anyway."
  warn "Not Ubuntu 24.04 (${PRETTY_NAME:-unknown}). Continuing because of --allow-other-os."
fi
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
HOME_DIR="/home/$DEPLOY_USER"

step "Host name and time"
if [ -n "$NEW_HOSTNAME" ] && [ "$(hostname)" != "$NEW_HOSTNAME" ]; then run hostnamectl set-hostname "$NEW_HOSTNAME"; fi
run timedatectl set-timezone UTC
# systemd-timesyncd ships with Ubuntu and keeps the clock right; TLS and wallet message expiry
# both depend on it
run timedatectl set-ntp true

step "Packages and security updates"
run apt-get update -q
run apt-get -y -q -o Dpkg::Options::=--force-confold full-upgrade
run apt-get -y -q install --no-install-recommends ca-certificates curl gnupg openssl jq rsync ufw fail2ban python3-systemd \
  unattended-upgrades apt-listchanges smartmontools nvme-cli mdadm cifs-utils sshfs
if [ "$HWE" = 1 ]; then run apt-get -y -q install linux-generic-hwe-24.04; fi

step "Disks"
if [ -r /proc/mdstat ] && grep -q '^md' /proc/mdstat; then
  grep -E '^md|blocks' /proc/mdstat >&2 || true
  if grep -qE '\[U*_[U_]*\]' /proc/mdstat; then
    warn "A RAID array is DEGRADED: one disk is missing or failed. Have the datacenter replace it before going live."
  else
    log "Software RAID is healthy."
  fi
  if grep -qE 'resync|recovery' /proc/mdstat; then log "The arrays are still syncing; that finishes on its own and only costs some speed meanwhile."; fi
  # arrays must be in mdadm.conf to assemble at boot under the same names
  if [ -f /etc/mdadm/mdadm.conf ] && ! grep -q '^ARRAY' /etc/mdadm/mdadm.conf; then
    if [ "$DRY_RUN" = 1 ]; then log "would add the arrays to /etc/mdadm/mdadm.conf"; else mdadm --detail --scan >> /etc/mdadm/mdadm.conf && update-initramfs -u; fi
  fi
else
  warn "No software RAID found. The recommended layout is two NVMe drives in RAID 1, so one failed drive costs nothing."
fi
run systemctl enable --now smartmontools
log "Free space on /: $(df -h --output=avail / | tail -n 1 | tr -d ' ')"

step "Deploy user $DEPLOY_USER"
if ! id "$DEPLOY_USER" > /dev/null 2>&1; then
  taken=$(getent passwd "$DEPLOY_UID" | cut -d: -f1 || true)
  [ -z "$taken" ] || die "uid $DEPLOY_UID already belongs to $taken. Pick another with --deploy-uid."
  getent group "$DEPLOY_UID" > /dev/null && die "gid $DEPLOY_UID is already taken. Pick another with --deploy-uid."
  run groupadd --gid "$DEPLOY_UID" "$DEPLOY_USER"
  run useradd --create-home --shell /bin/bash --uid "$DEPLOY_UID" --gid "$DEPLOY_UID" "$DEPLOY_USER"
elif [ "$(id -u "$DEPLOY_USER")" = 1000 ] && [ "$MOVE_DEPLOY_UID" = 0 ]; then
  warn "$DEPLOY_USER has uid 1000, the uid the control plane (and, on releases up to 3.0.0, every workspace and the single-mode app) runs as inside its container, so someone who broke out of one would be $DEPLOY_USER, with sudo and the docker group. To move it to $DEPLOY_UID: run this again with --keep-root-login, log in as root (or use the Robot console), run it with --move-deploy-uid, then run it once more without --keep-root-login. Nil stops for about a minute while the uid moves."
elif [ "$(id -u "$DEPLOY_USER")" = 1000 ]; then
  # usermod refuses while any process runs as the uid, and Nil's containers run as 1000 too
  [ "${SUDO_USER:-}" != "$DEPLOY_USER" ] || die "--move-deploy-uid has to run as root directly: this sudo from $DEPLOY_USER keeps the uid in use."
  ! pgrep -u "$DEPLOY_USER" -f '^sshd' > /dev/null 2>&1 || die "$DEPLOY_USER is logged in. Log out every $DEPLOY_USER session and run this again."
  taken=$(getent passwd "$DEPLOY_UID" | cut -d: -f1 || true)
  [ -z "$taken" ] || die "uid $DEPLOY_UID already belongs to $taken. Pick another with --deploy-uid."
  old_gid=$(id -g "$DEPLOY_USER")
  stopped=()
  if command -v docker > /dev/null 2>&1; then mapfile -t stopped < <(docker ps -q); fi
  if [ ${#stopped[@]} -gt 0 ]; then
    log "Stopping ${#stopped[@]} containers while the uid moves"
    run docker stop --time 30 "${stopped[@]}" > /dev/null
  fi
  if [ "$DRY_RUN" = 0 ] && pgrep -u "$DEPLOY_USER" > /dev/null; then
    busy=$(pgrep -u "$DEPLOY_USER" -l | head -n 3 | tr '\n' ' ')
    if [ ${#stopped[@]} -gt 0 ]; then docker start "${stopped[@]}" > /dev/null; fi
    die "Something still runs as $DEPLOY_USER ($busy). Nothing was changed, and the containers run again."
  fi
  run usermod --uid "$DEPLOY_UID" "$DEPLOY_USER"
  if [ "$(getent group "$DEPLOY_USER" | cut -d: -f3)" = "$old_gid" ] && ! getent group "$DEPLOY_UID" > /dev/null; then
    run groupmod --gid "$DEPLOY_UID" "$DEPLOY_USER"
    # usermod moved the files' owner in the home folder, not their group
    run find "$HOME_DIR" -xdev -gid "$old_gid" -exec chgrp -h "$DEPLOY_USER" {} +
  fi
  for spool in "/var/spool/cron/crontabs/$DEPLOY_USER" "/var/mail/$DEPLOY_USER"; do
    if [ -e "$spool" ]; then run chown "$DEPLOY_USER" "$spool"; fi
  done
  # Nil's folder and its logs are handed to the new uid further down
  if [ ${#stopped[@]} -gt 0 ]; then run docker start "${stopped[@]}" > /dev/null; fi
  log "$DEPLOY_USER is now uid $DEPLOY_UID."
fi
# no password at all: keys only
run passwd -l "$DEPLOY_USER" > /dev/null
if [ ${#SSH_KEYS[@]} -eq 0 ] && [ -s /root/.ssh/authorized_keys ]; then mapfile -t SSH_KEYS < <(grep -E '^(ssh-|ecdsa-|sk-)' /root/.ssh/authorized_keys); fi
if [ ${#SSH_KEYS[@]} -gt 0 ]; then
  existing=$(cat "$HOME_DIR/.ssh/authorized_keys" 2> /dev/null || true)
  { printf '%s\n' "$existing"; printf '%s\n' "${SSH_KEYS[@]}"; } | grep -E '^(ssh-|ecdsa-|sk-)' | awk '!seen[$0]++' |
    install_file "$HOME_DIR/.ssh/authorized_keys" 600 "$DEPLOY_USER:$DEPLOY_USER" || true
  run chmod 700 "$HOME_DIR/.ssh"
  run chown "$DEPLOY_USER:$DEPLOY_USER" "$HOME_DIR/.ssh"
fi
# The docker group is as powerful as root, so passwordless sudo adds nothing a stolen deploy
# key wouldn't already give; it does keep the server manageable once root can't log in.
printf '%s ALL=(ALL) NOPASSWD:ALL\n' "$DEPLOY_USER" | install_file "/etc/sudoers.d/90-nil-$DEPLOY_USER" 440 && run visudo -cf "/etc/sudoers.d/90-nil-$DEPLOY_USER"

step "SSH: keys only"
keys_ok=0
if [ -s "$HOME_DIR/.ssh/authorized_keys" ]; then keys_ok=1; fi
if [ "$DRY_RUN" = 1 ] && [ ${#SSH_KEYS[@]} -gt 0 ]; then keys_ok=1; fi
[ "$keys_ok" = 1 ] || die "$DEPLOY_USER has no SSH key, so turning off passwords and root logins would lock you out. Pass --ssh-key or --ssh-key-file."
root_login=no
users=$DEPLOY_USER
if [ "$KEEP_ROOT" = 1 ]; then root_login=prohibit-password users="$DEPLOY_USER root"; fi
if sed -e "s/@ROOT_LOGIN@/$root_login/" -e "s/@ALLOW_USERS@/$users/" "$HERE/host/sshd-hardening.conf" | install_file /etc/ssh/sshd_config.d/10-nil-hardening.conf 644; then
  run sshd -t
  run systemctl reload ssh
  log "SSH now takes keys only. Check that 'ssh $DEPLOY_USER@<server>' works from a second terminal before closing this one."
fi

step "Firewall: only SSH, HTTP and HTTPS"
run ufw default deny incoming
run ufw default allow outgoing
run ufw limit 22/tcp comment ssh
run ufw allow 80/tcp comment http
run ufw allow 443/tcp comment https
run ufw allow 443/udp comment http3
run ufw --force enable
# Docker's published ports bypass ufw. Only Caddy publishes any (80 and 443); workspaces,
# the control plane and the Ethereum node publish nothing.

step "fail2ban"
if install_file /etc/fail2ban/jail.d/nil-sshd.local 644 < "$HERE/host/fail2ban-sshd.local"; then run systemctl restart fail2ban; fi
run systemctl enable --now fail2ban

step "Automatic security updates"
install_file /etc/apt/apt.conf.d/20auto-upgrades 644 < "$HERE/host/20auto-upgrades" || true
sed -e "s/@AUTO_REBOOT@/$([ -n "$AUTO_REBOOT" ] && echo true || echo false)/" -e "s/@REBOOT_TIME@/${AUTO_REBOOT:-04:30}/" "$HERE/host/52nil-unattended-upgrades" |
  install_file /etc/apt/apt.conf.d/52nil-unattended-upgrades 644 || true
run systemctl enable --now unattended-upgrades

step "Docker Engine from Docker's own repository"
if ! dpkg -s docker-ce > /dev/null 2>&1; then
  run install -m 0755 -d /etc/apt/keyrings
  if [ "$DRY_RUN" = 1 ]; then
    log "would fetch and check Docker's signing key"
  else
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc.new
    # the fingerprint Docker publishes; refuse anything else
    gpg --show-keys --with-colons /etc/apt/keyrings/docker.asc.new | awk -F: '/^fpr/ { print $10 }' | grep -qx 9DC858229FC7DD38854AE2D88D81803C0EBFCD88 ||
      die "Docker's signing key didn't match its published fingerprint."
    mv /etc/apt/keyrings/docker.asc.new /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
  fi
  printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' \
    "${VERSION_CODENAME:-noble}" "$(dpkg --print-architecture)" | install_file /etc/apt/sources.list.d/docker.sources 644 || true
  run apt-get update -q
  run apt-get -y -q install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
if sed "s#@ADDRESS_POOL@#$ADDRESS_POOL#" "$HERE/host/docker-daemon.json" | install_file /etc/docker/daemon.json 644; then
  # live-restore keeps running containers up while the daemon restarts
  run systemctl restart docker
fi
run systemctl enable --now docker
if ! id -nG "$DEPLOY_USER" 2> /dev/null | tr ' ' '\n' | grep -qx docker; then run usermod -aG docker "$DEPLOY_USER"; fi

step "Kernel and network tuning"
install_file /etc/sysctl.d/90-nil.conf 644 < "$HERE/host/sysctl-nil.conf" || true
run modprobe nf_conntrack
run sysctl --quiet --system

step "Swap"
swaps=$(swapon --show=NAME --noheadings 2> /dev/null | tr '\n' ' ' || true)
if [ -n "$swaps" ] && swapon --show=NAME --noheadings | grep -qvE '^/dev/(mapper/|dm-)'; then
  warn "Swap is on ($swaps) and not on an encrypted device, so what the host keeps in memory can end up on the disk in the clear. To turn it off: sudo swapoff -a, then remove its line from /etc/fstab."
elif [ -n "$swaps" ]; then
  log "Swap is on, on an encrypted device: $swaps"
elif [ "$SWAP_GB" = 0 ]; then
  log "No swap, as recommended."
elif ! findmnt -no FSTYPE / | grep -qE '^(ext4|xfs)$'; then
  warn "The root filesystem isn't ext4 or xfs; create swap by hand if you want it."
else
  warn "Creating an unencrypted ${SWAP_GB} GB swap file because of --swap-gb. Memory that is swapped out is written to the disk in the clear."
  run fallocate -l "${SWAP_GB}G" /swapfile
  run chmod 600 /swapfile
  run mkswap /swapfile
  run swapon /swapfile
  if ! grep -q '^/swapfile ' /etc/fstab; then
    if [ "$DRY_RUN" = 1 ]; then log "would add /swapfile to /etc/fstab"; else echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
  fi
fi

step "Logs"
if install_file /etc/systemd/journald.conf.d/90-nil.conf 644 < "$HERE/host/journald-nil.conf"; then run systemctl restart systemd-journald; fi
sed "s/@DEPLOY_USER@/$DEPLOY_USER/g" "$HERE/host/logrotate-nil" | install_file /etc/logrotate.d/nil 644 || true
run install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /var/log/nil

step "Nil's folder: $NIL_DIR"
run install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$NIL_DIR" "$NIL_DIR/deploy" "$NIL_DIR/releases" "$NIL_DIR/examples"
docker_gid=$(getent group docker | cut -d: -f3 || true)
if [ ! -f "$NIL_DIR/.env" ]; then
  if [ "$DRY_RUN" = 1 ]; then
    log "would create $NIL_DIR/.env for $MODE mode"
  else
    template="$HERE/hosted.env.example"
    [ "$MODE" = single ] && template="$HERE/single/single.env.example"
    install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$template" "$NIL_DIR/.env"
  fi
fi
env_set "$NIL_DIR/.env" NIL_MODE "$MODE"
[ -z "$docker_gid" ] || env_set "$NIL_DIR/.env" DOCKER_GID "$docker_gid"
run cp -r "$HERE/." "$NIL_DIR/deploy/"
run chown -R "$DEPLOY_USER:$DEPLOY_USER" "$NIL_DIR"
if [ "$MODE" = hosted ]; then
  env_set "$NIL_DIR/.env" NIL_BACKUP_DIR "$BACKUP_DIR"
  # the control plane runs as uid 1000 in its container and writes backups here
  run install -d -m 700 -o 1000 -g 1000 "$BACKUP_DIR"
fi
if [ "$WITH_CHAIN" = 1 ]; then
  run install -d -m 700 "$NIL_DIR/chain"
  if [ ! -s "$NIL_DIR/chain/jwt.hex" ]; then
    if [ "$DRY_RUN" = 1 ]; then log "would create the engine API secret $NIL_DIR/chain/jwt.hex"; else (umask 077 && openssl rand -hex 32 > "$NIL_DIR/chain/jwt.hex"); fi
  fi
fi

step "Done"
if [ -f /var/run/reboot-required ]; then warn "A reboot is needed to finish installing updates (or the HWE kernel). Run: reboot"; fi
cat >&2 << EOF
Next:
  1. From a second terminal, check: ssh $DEPLOY_USER@<server>  (root logins are now off)
  2. On your own machine: deploy/release.sh --mode $MODE --host $DEPLOY_USER@<server>
  3. Fill in $NIL_DIR/.env and the settings files it lists, then: $NIL_DIR/deploy/upgrade.sh <version>
EOF
