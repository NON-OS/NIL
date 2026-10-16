# Private tasks

A private task can be seen by two people only: whoever created it and whoever it's assigned to. Admins can't see it. Its words are encrypted in your browser, so the server stores scrambled text it has no key for.

## Make a task private

When you create it, click **Private** in the new task box before you save. The button changes to **Private · encrypted**, and the task is encrypted from its first save.

For a task that already exists, open it, click the **Visible to** field and choose **Only the creator and assignee**. Only the creator or the assignee can change this field.

To open a private task up again, choose **Everyone in the workspace**. Your browser then sends its title, notes, checklist and comments back to the server as plain text.

## Unlock with your wallet

Private tasks use the same keys as [encrypted docs](encrypted-docs.md#unlock-docs). Until you unlock, a private task shows **Encrypted** with an **Unlock** button in its panel. Click it and sign the message in your wallet; it starts with "Unlock my Nil encryption keys". The first time, Nil sets up your keys and your wallet signs three times.

Your keys live only in that browser tab's memory once unlocked. When you close or reload the tab they're gone, and you unlock again next time.

## What is encrypted and what isn't

Your browser encrypts the title, the description, the checklist, every comment and every attached file, including the file's name and type. Each file gets its own key, which is sealed under the task's key.

The server can still see:

- that the task exists, and its key (such as NON-42),
- who created it and who it's assigned to,
- its status, priority, estimate and labels,
- its due date, start date and repeat schedule,
- its project, goal and bounty,
- when it was created, changed and finished.

It also stores any time entries and reminders that point at the task, with their notes in plain form.

## What works differently

- Files are encrypted in your browser before they upload. Pictures preview inside the task panel and other files download under their real names; neither opens in a new tab. The server still sees each file's size.
- Mentioning someone with `@` in a comment doesn't notify them, because the server can't read the comment. The creator and the assignee still hear that a comment was added.
- The built-in AI can't read a private task, so **Draft with AI** and **Break it down** don't work on one.
- AI assistants connected over MCP can't create private tasks. Your own private tasks appear to them as "Private task (encrypted)". Other people's private tasks don't appear at all.
- A private task can't be shared with a read-only link or listed on the public bounty board.
- Exports, including the timesheet CSV, show it as "Private task (encrypted)".
- A status deck includes it only if you turn on **Include my private tasks**.
- A notification from your operating system says "A private task" instead of its title, because the system keeps its own history of notifications.

For everyone else, a private task doesn't exist: it isn't in their lists, live updates, notifications, activity or exports. When you look at one, your teammates don't see you as viewing anything.

## Giving it to someone else

When a private task gets a new assignee, your browser makes a new key, encrypts the task and all its comments again with it, re-seals each file's key under it (the files themselves stay as they are), and seals the new key for the creator and the new assignee. The previous assignee loses access. They may still have copies of anything they read before.

Your browser seals a task key only to keys you've confirmed. If you haven't checked the other person's key yet, Nil asks you to **Check their keys** first, as for [docs](encrypted-docs.md#check-your-teammates-keys). If you click **Not now**, or they haven't set up keys yet, the task is sealed without them and they see "This task hasn't been shared with your key yet". Once you've confirmed their key, your browser hands the task over the next time you unlock in Nil.

## Private tasks from before encryption

Private tasks made before encryption existed are encrypted the next time their creator or assignee unlocks, files included. When a task is encrypted for the first time, the server also deletes the plain copies of its words it kept: old titles and checklist items in the task's history, previews in notifications and the title stored for proof of work. The signed receipt stays valid, but its title can no longer be revealed in a proof.

## If a private task won't open

| What you see | What to do |
|---|---|
| Unlock with your wallet to change this private task | You haven't unlocked in this tab yet. Click **Unlock** |
| This task hasn't been shared with your key yet | The other person on the task hasn't confirmed your key. Ask them to check your fingerprint. Once they have, their browser hands you the task the next time they unlock |
| This task couldn't be opened and checked here | It was sealed to keys you no longer hold, or Nil can't confirm that a teammate wrote it. If someone's key changed recently, check it under **Teammates' keys** in **Settings → Sign-in & security** |

If you start over with new keys (see [Encrypted docs](encrypted-docs.md#if-unlocking-fails)), Nil drops your copies of private-task keys. The other person's browser hands each task to you again once they've confirmed your new key.

## How it works

Each private task has its own random 256-bit key. The title, the notes, the checklist and every comment are encrypted separately with AES-256-GCM. Each ciphertext is bound to its task and field through the cipher's associated data, so the server can't move one piece of text into another place.

The task key is sealed separately for the creator and for the assignee. Your browser makes a throwaway X25519 key pair, agrees on a secret with that person's public key, turns the secret into a wrapping key with HKDF-SHA256, and wraps the task key with AES-256-GCM. Only that person's private key can unwrap it.

Before it's encrypted, each piece of text is signed with its writer's Ed25519 key. Anyone can seal a key to your public key, so the signature, not the encryption, shows who wrote the words. A task whose words don't check out stays locked. Comments are signed for the task and their author, so they keep their signatures when the task moves to a new key.

Your own keys come from a random seed your browser makes, which the server holds only locked to your wallets. [Encryption and trust](encryption.md) explains how that works and how teammates check each other's keys.

The server refuses plain text for a private task, and refuses a key sealed for anyone other than the creator and the assignee. It can't check the encrypted contents, only their shape and size.
