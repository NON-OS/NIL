# Backups and moving

Your workspace lives on one server. This page covers getting your data out of it: spreadsheets for everyday use, encrypted capsules for a full copy, and moving to a new server.

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

Everyone then signs in again with their wallets. Wallets work on any domain, so nobody needs a new invite. Because the signing key comes along, earlier proofs of work still verify, and everyone's encryption, private payout and voting keys stay the same.

By default the new server accepts capsules up to 4096 MB. The operator can raise this with `MAX_CAPSULE_MB`.

## Server backups

If you run the server, back up its data folder as well as downloading capsules. The most important file is the signing key in `DATA_DIR/keys`. Without it, nobody can derive their encryption keys again and earlier proofs stop matching the workspace. [Production deployment](deploy.md#10-backups) has scripts for nightly and cold backups and for restoring them.

Backups and capsules hold most of the workspace in readable form once opened: team tasks, comments, files and the signing key. Only docs, the words of private tasks and encrypted ballots stay encrypted. Encrypt backups before they leave the server.

## How capsules work

A capsule is encrypted with AES-256-GCM under a key derived from your passphrase with scrypt (N = 2^17). The file's header, which holds the format version, the salt and the nonce, is bound to the ciphertext as associated data, so changing it makes the file fail to open. On restore, only the database, the signing key and files in the uploads folder can be extracted, so a crafted capsule can't write anywhere else.
