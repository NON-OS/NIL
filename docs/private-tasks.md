# Private tasks

A private task can be seen by two people only: whoever created it and whoever it's assigned to. Admins can't see it. Its words are encrypted in your browser, so the server stores scrambled text it has no key for.

## Make a task private

When you create it, click **Private** in the new task box before you save. The button changes to **Private · encrypted**, and the task is encrypted from its first save.

For a task that already exists, open it, click the **Visible to** field and choose **Only the creator and assignee**. Only the creator or the assignee can change this field.

To open a private task up again, choose **Everyone in the workspace**. Your browser then sends its title, notes, checklist and comments back to the server as plain text.

## Unlock with your wallet

Private tasks use the same key as [encrypted docs](encrypted-docs.md). Until you unlock, a private task shows **Encrypted** with an **Unlock** button in its panel. Click it and sign the message in your wallet; it starts with "NONOS encryption key". The first time, you sign it twice, so Nil can check that your wallet always gives the same signature.

Your key lives only in that browser tab's memory and is never uploaded. When you close or reload the tab it's gone, and you unlock again next time.

## What is encrypted and what isn't

Your browser encrypts the title, the description, the checklist and every comment.

The server can still see:

- that the task exists, and its key (such as NON-42),
- who created it and who it's assigned to,
- its status, priority, estimate and labels,
- its due date, start date and repeat schedule,
- its project, goal and bounty,
- when it was created, changed and finished.

It also stores any time entries and reminders that point at the task, with their notes in plain form.

## What works differently

- Files can't be attached, because files aren't encrypted yet. To make a task with files private, remove the files first.
- Mentioning someone with `@` in a comment doesn't notify them, because the server can't read the comment. The creator and the assignee still hear that a comment was added.
- The built-in AI can't read a private task, so **Draft with AI** and **Break it down** don't work on one.
- AI assistants connected over MCP can't create private tasks. Your own private tasks appear to them as "Private task (encrypted)". Other people's private tasks don't appear at all.
- A private task can't be shared with a read-only link or listed on the public bounty board.
- Exports, including the timesheet CSV, show it as "Private task (encrypted)".
- A status deck includes it only if you turn on **Include my private tasks**.

For everyone else, a private task doesn't exist: it isn't in their lists, live updates, notifications, activity or exports. When you look at one, your teammates don't see you as viewing anything.

## Giving it to someone else

When a private task gets a new assignee, your browser makes a new key, encrypts the task and all its comments again with it, and seals the key for the creator and the new assignee. The previous assignee loses access. They may still have copies of anything they read before.

If the new assignee has never unlocked encrypted docs or private tasks, they have no key yet. They see the task as locked with the note "This task was sealed before you had a key". Once they have unlocked, the task opens for them after the creator next unlocks in Nil, because the creator's browser hands over the key.

## Private tasks from before encryption

Private tasks made before encryption existed are encrypted the next time their creator or assignee unlocks. A task with files stays as it is until the files are removed. When a task is encrypted for the first time, the server also deletes the plain copies of its words it kept: old titles and checklist items in the task's history, previews in notifications and the title stored for proof of work. The signed receipt stays valid, but its title can no longer be revealed in a proof.

## If a private task won't open

| What you see | What to do |
|---|---|
| Unlock with your wallet to change this private task | You haven't unlocked in this tab yet. Click **Unlock** |
| Your key couldn't open this task | You unlocked with a different wallet from the one you first used for encryption. Switch back to it |
| This task was sealed before you had a key | The creator's browser hands you the key the next time they unlock |

If you ever reset your encryption key (see [Encrypted docs](encrypted-docs.md#if-unlocking-fails)), private tasks sealed to your old key stay locked for you. The other person can reassign the task, which seals it under a new key that includes yours.

## How it works

Each private task has its own random 256-bit key. The title, the notes, the checklist and every comment are encrypted separately with AES-256-GCM. Each ciphertext is bound to its task and field through the cipher's associated data, so the server can't move one piece of text into another place.

The task key is sealed separately for the creator and for the assignee. Your browser makes a throwaway X25519 key pair, agrees on a secret with that person's public key, turns the secret into a wrapping key with HKDF-SHA256, and wraps the task key with AES-256-GCM. Only that person's private key can unwrap it.

Your own X25519 key pair comes from a wallet signature over a fixed message that names the workspace by its signing key and names your account. HKDF-SHA256 stretches the signature into the private key. Wallets sign deterministically (RFC 6979), so the same wallet always produces the same key, and the server stores only your public key.

The server refuses plain text for a private task, and refuses a key sealed for anyone other than the creator and the assignee. It can't check the encrypted contents, only their shape and size.
