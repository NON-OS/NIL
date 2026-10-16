# Zero-state

The less a server keeps, the less there is to leak, subpoena or lose. Nil gives you three levels of control.

## 1. Retention policies

In **Settings → Data & privacy → Zero-state**, admins can set how long each kind of data lives:

- **Finished and canceled tasks**, with their comments and files
- **Comments** on any task
- **Task history** (the activity log)

The choices are: keep forever, or erase after 1, 7, 30, 90, 180 or 365 days. An hourly sweep erases expired data for good. SQLite's `secure_delete` overwrites the freed space in the database file, and after every sweep, wipe or erase the write-ahead log (`nonos.db-wal`) is folded back in and cut to nothing, so erased text doesn't linger there either. Neither can reach copies the filesystem, a snapshot or a backup already made.

Receipts survive this, so proofs people already exported stay valid. The private data needed to reveal a title is erased along with the task.

Trashed tasks are always erased after `TRASH_DAYS` (30 by default). Read notifications are erased after 90 days.

## 2. Erase everything

An **owner** can erase the entire workspace from **Settings → Data & privacy**. To confirm, type the workspace name exactly. This deletes every row, every uploaded file and the proof signing key, signs everyone out, and returns the server to a fresh install. Download an encrypted capsule first if you might want the data back.

## 3. Memory-only mode

For the strictest setups, run Nil with its data folder in RAM. Nothing ever touches the disk, and everything disappears when the container stops or the machine reboots.

```bash
docker compose -f docker-compose.yml -f docker-compose.ram.yml up -d --build
```

Use encrypted capsules to carry a workspace between sessions: restore one when you start, and download a fresh one before you stop.

> If the host swaps memory to disk, data can still land on disk. Turn swap off, or use encrypted swap, for real memory-only operation.
