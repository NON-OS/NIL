# Encrypted docs

Docs is where your team keeps specs, meeting notes and runbooks that only the team should read. Every doc is encrypted in the browser before it's saved. The server stores scrambled text it has no key for, titles included.

Docs are for members. Guests don't get them.

## Unlock docs

Open **Docs** and click **Unlock with your wallet**. Your wallet signs one fixed message, which starts with "NONOS encryption key". Nothing is sent on-chain and it costs nothing. Your browser turns the signature into your personal key.

The first time, you sign twice, so Nil can check that your wallet gives the same signature each time. The key stays in that browser tab's memory and is never uploaded, so you unlock again after closing or reloading the tab. The same key opens [private tasks](private-tasks.md).

## Write a doc

Click the plus button above the list. A new doc called "Untitled" opens, shared with the whole team. Start typing. Nil saves a moment after you stop, and encrypts the text before it leaves your browser. The status at the top says **Encrypted · saved**, **Unsaved**, **Encrypting…** or **Conflict**.

Docs understand Markdown: `#` for headings, `**bold**`, lines starting with `-` for lists and `[text](https://example.com)` for links. Click **Preview** to see the result and **Write** to go back.

The other buttons along the top:

| Button | What it does |
|---|---|
| Draft | Asks the built-in AI to write for you. Shown only when built-in AI is on (see below) |
| The people button, showing Team or a number | Sets who can read the doc |
| The clock | Opens the version history |
| The download arrow | Saves the doc on your device as a Markdown file, decrypted |
| The printer | Prints the doc or saves it as a PDF |
| The bin | Deletes the doc for everyone. Only its creator or an admin can delete it |

The **Search docs** box above the list looks through titles and text that your browser has decrypted. The server never sees what you search for.

## Choose who can read a doc

Click the people button and choose **Whole team** or **Specific people**, then **Save**.

- With **Whole team**, everyone in the workspace can read and edit it. Teammates who haven't unlocked docs yet get the key the next time a teammate opens Docs.
- With **Specific people**, tick the people who may read and edit it. People who haven't unlocked docs yet can't be ticked until they do.

Only the doc's creator or an admin can switch a doc between the two choices, remove people, or add people to a doc shared with specific people. Removing someone gives the doc a new key, so they can't read anything saved after that. They may still have copies of what they read before.

## When two people edit at once

If someone saves a newer version while you're typing, Nil doesn't overwrite it. You see "Someone saved a newer version while you were typing" with two buttons. **Load theirs** throws away your unsaved change and shows their version. **Keep mine** saves your text on top of theirs.

## Version history

The clock button lists earlier versions, decrypted in your browser. Nil keeps the last 25. **Restore** brings an old version back as the newest one; the version it replaces stays in the history.

## Waiting for a key

A doc listed as "Encrypted doc" with "Waiting for a key from" and a name was shared with the team before you unlocked. A teammate's browser hands you the key the next time they open Docs.

## Draft with AI

When built-in AI is on, **Draft** opens **Draft with AI**. Describe what you want and click **Draft**. The text is added to the end of the doc.

This is the one time a doc's text leaves your browser. Your instruction goes to Anthropic for that single request, and so does the doc's current text if **Use what's already in this doc as context** is on. The result is encrypted in your browser before it's saved.

## If unlocking fails

"This wallet unlocks a different key than the one your docs are sealed to" means you're using a different wallet from the one you first unlocked with. Switch back to that wallet.

If that wallet is gone for good, click **Use this wallet with a new key instead** and confirm. You start over with a new key and lose access to every doc sealed to the old one. Teammates' browsers hand you team docs again the next time they open Docs. Docs shared with specific people have to be shared with you again, and [private tasks](private-tasks.md#if-a-private-task-wont-open) sealed to your old key stay locked.

"Your wallet signs the same message differently each time" means that wallet can't hold an encryption key. Use another one, such as MetaMask, Rabby, Ledger or Trezor.

## How it works

Your key pair is the same X25519 pair used for private tasks, derived in the browser with HKDF-SHA256 from a deterministic wallet signature. The signed message names the workspace by its signing key, not by its name, so renaming the workspace or moving it to another server with a capsule doesn't change anyone's key.

Each doc has its own random AES-256-GCM key. The title and the body are encrypted separately, each bound to the doc and the field through associated data. The doc key is sealed to every reader on its own: a throwaway X25519 key pair agrees on a secret with the reader's public key, HKDF-SHA256 turns it into a wrapping key, and AES-256-GCM wraps the doc key.

The server stores the ciphertext, the sealed keys, who can read each doc, who changed it and when, and up to 25 encrypted earlier versions. A save that starts from an outdated version is refused rather than overwriting someone else's work.
