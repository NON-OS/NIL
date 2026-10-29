# Zero-state

The less a server keeps, the less there is to leak, hand over or lose. Nil gives you three levels of control, from erasing old work automatically to keeping nothing on disk at all.

## Erase old data automatically

In **Settings → Data & privacy → Zero-state**, admins choose how long each kind of data lives:

| Setting | What it covers |
|---|---|
| Finished and canceled tasks | The tasks, with their comments and files |
| Comments | Comments on every task, open or not, with the words quoted from them in notifications and in agent briefings |
| Task history | The activity log: who changed what and when, and the sign-in audit trail |

Each can be kept forever (the default) or erased after 1, 7, 30, 90, 180 or 365 days. An hourly sweep on the server erases whatever has expired, for good. SQLite's `secure_delete` overwrites the freed space in the database file, and after every sweep, wipe or erase the write-ahead log (`nonos.db-wal`) is folded back in and cut to nothing, so erased text doesn't linger there either. Neither can reach copies the filesystem, a snapshot or a backup already made.

Agents' run logs, run summaries and audit trails, their decided approval cards and the replies stored for their repeated requests quote task text too, so they're erased after the shorter of the comment and task history settings. So is the log of webhook deliveries, which otherwise keeps 30 days (`AGENT_WEBHOOK_LOG_DAYS`).

Receipts survive this, so proofs that people already exported stay valid. The data needed to reveal a task's title in a proof is erased with the task, and the Proof of work page then shows "Title erased by a retention policy".

Some things are always erased on a schedule, whatever the settings: deleted tasks after 30 days in the trash (the operator can change this with `TRASH_DAYS`), read notifications after 90 days, and expired sessions and invites. A reminder goes as soon as it has been sent, since its notification carries it from then on. Share links and sign-in reset links go 30 days after they expired, were used or were revoked, API keys 30 days after they expired, and a bounty payment that was started but never sent 30 days after it ran out (`EXPIRED_DAYS`). A private payout's one-time address is kept until a recorded payment carries it, so the same address is never handed out twice.

Before each upgrade the server keeps a copy of the database, in case the upgrade has to be undone. Each copy holds everything erased since it was taken, so it is deleted after 7 days (`UPGRADE_COPY_DAYS`), or sooner when a setting above is shorter. The same goes for the checkpoint the upgrade script or hosted control plane takes (`.nil-checkpoint` in the data folder) and the copy a backup reads from (`.nil-snapshot`), and erasing everything removes both at once. A capsule download or restore cut off by a crash leaves a scratch copy of the database behind, which the server deletes when it starts again.

## Erase everything

An owner can erase the whole workspace. In **Settings → Data & privacy**, find **Erase everything**, type the workspace name exactly and click **Erase everything**. This deletes every task, comment, file, goal and account, and the proof signing key, then signs everyone out. The server goes back to a fresh install. On a server that charges for Nil Pro, the billing record stays, without who paid: the paid-until date, the trial's start and the transactions already counted. That way erasing can't start a new trial or make a payment count twice.

This can't be undone. [Download an encrypted capsule](backups-and-moving.md#encrypted-capsules) first if you might want the data back.

## Memory-only mode

For the strictest setups, run Nil with its data folder in memory. Nothing is written to disk, and everything disappears when the container stops or the machine restarts.

```bash
docker compose -f docker-compose.yml -f docker-compose.ram.yml up -d --build
```

The data folder gets up to 1 GB of memory, and files attached to tasks can take up to 768 MB of it, so the database always has room. Set `UPLOAD_QUOTA_MB` in `.env` to change that. To carry a workspace from one session to the next, restore an encrypted capsule when you start and download a fresh one before you stop.

> If the host swaps memory to disk, data can still end up on disk. Turn swap off, or use encrypted swap, for real memory-only operation.
