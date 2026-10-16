# Backups and moving

Your workspace lives on one server. This page covers getting your data out of it: spreadsheets for everyday use, encrypted capsules for a full copy, and moving to a new server. It also explains how a capsule differs from your own recovery kit.

## Export your tasks

Anyone can download a spreadsheet of the tasks they can see. Click **Export** on **All tasks**, or **Export tasks (CSV)** in **Settings → Data & privacy**. The file opens in any spreadsheet app. Private tasks appear as "Private task (encrypted)", and anything that looks like a spreadsheet formula is neutralised so it can't run.

Admins also get **Readable backup (JSON)**: a human-readable file with people, projects, labels, goals, tasks, comments and history. It never includes sessions, keys or other people's private tasks.

Your own timesheet exports from the **Time** page with **CSV**.

## Encrypted capsules

A capsule is one file holding the whole workspace: the database, every uploaded file and the workspace's signing key. It's locked with a passphrase you choose. Without the passphrase nobody can open it, you included.

To download one, you need to be an admin:

1. Open **Settings → Data & privacy**.
2. Under **Encrypted capsule**, type a passphrase of at least 12 characters, twice.
3. Click **Download capsule**. You get a file named like `nil-2026-10-16.capsule`.

Keep the passphrase in a password manager, and keep the capsule somewhere other than the server.

## Move to a new server

A capsule restores only into a server that has no workspace yet, so it can never overwrite one that's in use.

1. Start Nil on the new server with empty storage.
2. Open the site. On **Set up your workspace**, click **Moving servers? Restore from an encrypted capsule**.
3. Pick the capsule file, type the passphrase and click **Restore workspace**.

Everyone then signs in again with their wallets. Wallets work on any domain, so nobody needs a new invite. Because the signing key comes along, earlier proofs of work still verify.

Encryption keys depend on the web address. If the new server keeps the old address, everyone's keys open as before. At a new address, the messages that unlock people's keys change, so no wallet opens them there. Each person then restores their keys once from their [recovery kit](signing-in.md#keep-a-recovery-kit), which also lets the wallet in their browser unlock them from then on. Anyone without a kit starts over with new keys and loses what was shared with the old ones. Every browser's confirmed keys start over too, so teammates check each other's fingerprints again. Before moving to a new address, make sure everyone has a recovery kit.

By default the new server accepts capsules up to 4096 MB. The operator can raise this with `MAX_CAPSULE_MB`.

A capsule doesn't carry Nil Pro with it. On a server that charges, the new server keeps its own billing: paid time, trial, invoices and payments stay with the server they were paid to.

## Server backups

If you run the server, back up its data folder as well as downloading capsules. The most important file is the signing key in `DATA_DIR/keys`. Earlier proofs stop matching the workspace without it. Every message that unlocks someone's encryption keys names the workspace by that key, so without it no wallet opens anyone's keys, and recovery kits, which are tied to the old key, won't restore either. Everyone would start over with new keys, and every doc and private task would stay locked. [Production deployment](deploy.md#10-backups) has scripts for nightly and cold backups and for restoring them.

Backups and capsules hold most of the workspace in readable form once opened: team tasks, comments, files and the signing key. Only docs, the words of private tasks and encrypted ballots stay encrypted. Encrypt backups before they leave the server.

## Capsules and recovery kits

A capsule and a recovery kit are both files locked with a passphrase, but they hold different things.

| | Capsule | Recovery kit |
|---|---|---|
| Who makes it | An admin, in **Settings → Data & privacy** | Each person, for themselves, in **Settings → Sign-in & security** |
| What it holds | The database, uploads and the workspace signing key | One person's encryption keys |
| What it brings back | The whole workspace, on a server with no workspace yet | That person's keys, after they lose every wallet that holds them or the workspace moves to a new address |

A capsule can't open anyone's docs or private tasks. Their contents stay encrypted inside it, and people's keys are in the capsule only locked to their wallets. A recovery kit, in turn, is no use without the workspace it belongs to. Keep both.

## How capsules work

A capsule is encrypted with AES-256-GCM under a key derived from your passphrase with scrypt (N = 2^17). The file's header, which holds the format version, the salt and the nonce, is bound to the ciphertext as associated data, so changing it makes the file fail to open. On restore, only the database, the signing key and files in the uploads folder can be extracted, so a crafted capsule can't write anywhere else.
