# Encrypted docs

Docs is where your team keeps specs, meeting notes and runbooks that only the team should read. Every doc is encrypted in the browser before it's saved. The server stores scrambled text it has no key for, titles included.

Docs are for members. Guests don't get them.

## Unlock docs

Open **Docs** and click **Unlock with your wallet**. Your wallet shows a message that names your workspace's address and starts with "Unlock my Nil encryption keys". Nothing is sent on-chain and it costs nothing.

The first time, your browser makes your personal keys and your wallet signs three times: the unlock message twice, then a message that publishes your public keys so teammates can check them. A panel says what each signature is for while your wallet asks. After that, one signature unlocks your keys. They stay in that browser tab's memory, so you unlock again after closing or reloading the tab. The same keys open [private tasks](private-tasks.md).

Your keys aren't tied to one wallet. Every wallet you add to them unlocks the same keys. [Signing in](signing-in.md#the-signatures-for-encryption-keys) explains how to add a wallet and how to keep a recovery kit.

### Unlock with a passkey

If you've added a passkey to your keys, **Unlock with a passkey** sits next to **Unlock with your wallet**. Click it and confirm in your passkey manager, with your fingerprint, face or device PIN. Your keys unlock without a wallet signature and stay in the tab's memory, just as after a wallet unlock. Signing in still takes your wallet. [Unlock with a passkey](signing-in.md#unlock-with-a-passkey) explains how to add one.

## Write a doc

Click the plus button above the list. A new doc opens, shared with the whole team. The button beside it starts a doc from a template instead: meeting notes, a project brief, a runbook or a decision record, each a few headings and prompts to replace. Give it a title and start typing. Every change is signed and encrypted in your browser before it leaves, and reaches everyone else who has the doc open within a moment. The status at the top says **Encrypted · saved**, **Encrypting…**, **Offline · kept here** or **Not verified**.

The bar above the text has the usual formatting: headings, bold, italic, underline, strikethrough, inline code, highlight, links, bulleted, numbered and to-do lists, quotes, code blocks, alignment and tables. You rarely need it:

- Type `/` for a list of blocks to add, such as headings, lists, a to-do list, a table, a quote, a code block or a divider. Keep typing to narrow it, then press Enter.
- Type `@` and a name to mention a teammate. They get a notice in their inbox, and a push notification if they've switched those on, saying you mentioned them in a doc. The notice carries which doc, never its words.
- Select some words for a small bar with formatting, a link and **Comment**.
- Markdown shortcuts work as you type: `#` and a space for a heading, `-` for a list, `[ ]` for a to-do, three backticks for code.
- Ctrl+K (Cmd+K on a Mac) adds a link. Links go to web pages and email addresses only.

The buttons along the top:

| Button | What it does |
|---|---|
| Draft | Asks the built-in AI to write for you. Shown only when built-in AI is on (see below) |
| The speech bubble | Opens the doc's comments |
| The list | Opens an outline of the doc's headings |
| The people button, showing Team or a number | Sets who can read the doc |
| The three dots | Version history, download as Markdown (decrypted), print or save as PDF, and delete. Only a doc's creator or an admin can delete it, and it goes for everyone |

The **Search docs** box above the list looks through titles and text that your browser has decrypted. The server never sees what you search for.

## Edit together

Everyone who can read a doc can edit it at the same time. You see each other's cursors, with names, and faces at the top show who else has it open. Changes merge as you type, so nobody's words overwrite anybody else's, even when two people type in the same sentence.

If the connection drops, keep typing. Your changes wait in the tab, the status says **Offline · kept here**, and they go out when the connection is back. Closing the tab while changes are still waiting asks you first.

Every few seconds the browser of whoever is typing saves a new signed version that folds the changes in. That keeps the doc quick to open and gives the history something to show.

## Comments

Select some words and click **Comment**, or press Ctrl+Alt+M. Write your comment and click **Comment** again. The words get a yellow underline, and the thread opens in the panel on the right. Anyone who can read the doc can reply, resolve a thread or reopen it. Whoever started a thread, or an admin, can delete it. Resolved threads are hidden unless you switch on **Show resolved**.

Comments are part of the doc, so they're encrypted and signed exactly like its text, and they go with the doc when it's shared or re-keyed.

## Check your teammates' keys

To share a doc with someone, your browser seals the doc's key to their public key, which it gets from the server. So that a server can't slip in a key of its own, you compare each teammate's key with them once, and Nil shares nothing with a key you haven't confirmed.

When someone sets up keys for the first time, or someone's key changes, **Docs** shows a notice such as "New key for Ana" with a **Check keys** button. A key the server lists for someone deactivated, or for someone who isn't in the workspace, shows there too: nobody should be publishing one, and Nil doesn't count what it signs until you confirm it. Sharing a doc with someone whose key you haven't confirmed opens the same window, **Check their keys**.

1. Ask the person to open **Settings → Sign-in & security**, unlock their keys if Nil asks, and read out **Your key fingerprint**. It's five groups of four characters, such as `5c1e-90ab-3f27-d4e8-a061`.
2. Compare it with the fingerprint under their name, face to face or on a call. A message sent through the same workspace doesn't count, because the server could change it.
3. If the two match, click **Confirm**. If the key changes while you're comparing, Nil confirms nothing and shows the new fingerprint, so compare again.

**Not now** closes the window and shares nothing. **Confirm all** appears only when every key in the list is new. A key marked **Key changed** shows its old fingerprint too. That's normal after someone starts over with new keys or restores them on a new wallet, but it's also what a tampered server would show, so confirm it only after you've checked with them. If you had confirmed their old key, what they signed with it before the change still opens, with a note that it was signed with their earlier key.

Your browser remembers the keys you confirmed. A new browser or device starts with none and asks again. You can check every teammate's key at any time under **Teammates' keys** in **Settings → Sign-in & security**. [Encryption and trust](encryption.md#the-key-directory-and-what-teammates-check) explains what the check protects against.

## Choose who can read a doc

Click the people button and choose **Whole team** or **Specific people**, then **Save**.

- With **Whole team**, everyone in the workspace can read and edit it. Someone who sets up keys later gets the doc once a teammate has confirmed their key and opens Docs. Only a version signed as a team doc is handed on like this, whatever the server lists.
- With **Specific people**, tick the people who may read and edit it. People who haven't unlocked docs yet can't be ticked until they do. Nil asks you to check the keys of anyone you add.

Only the doc's creator or an admin can switch a doc between the two choices, remove people, or add people to a doc shared with specific people. Removing someone gives the doc a new key, so they can't read anything saved after that. They may still have copies of what they read before.

## Version history

The three dots open **Version history**: earlier versions, decrypted in your browser, newest first. The last hour keeps a version for about every minute, the last day one for every quarter of an hour, and older history one a day, up to 100 versions (`DOC_REVISIONS` sets the number). **Restore** brings an old version back as a new change on top, which everyone editing sees arrive; the version it replaces stays in the history.

## Signed versions and changes

Each live change is signed by whoever made it, for this doc and this change, together with which key protects it and when it was made. A change that doesn't open with the doc's key, or whose signature doesn't check out against the key you know for its author, or that comes from someone who doesn't hold the doc's key, is left out, and the doc says how many were.

Each version of a doc is signed by whoever saved it, with a signing key only their browser holds, together with who the version is for and which key protects it. If a version's signature doesn't check out against the keys you know, if its signer isn't one of the readers it names, or if it's under a different key from the one signed, the doc says "Nil can't confirm a teammate wrote this version" and opens read-only. The server may have changed it, so don't rely on it. If someone's key changed recently, check it first. To keep the text, the doc's creator or an admin opens the people button and clicks **Save**, which gives the doc a new key and signs the text as theirs.

Your browser also remembers the newest version it has opened of each doc. If the server later serves an older one, the doc says "This is an older version than one you've already opened here."

A version saved before Nil signed who a doc is for says "This version was saved in an older format that can't show who it's for". Nil won't share it with new teammates on its own. Saving it again signs it in the new format, for the audience and readers the server lists at that moment.

## Waiting for a key

A doc listed as "Encrypted doc" with "Waiting for a key from" and a name was shared with the team before you set up your keys. A teammate's browser hands you the key once that teammate has confirmed your key and opens Docs. If it's taking a while, ask them to check your fingerprint.

## Draft with AI

When built-in AI is on, **Draft** opens **Draft with AI**. Describe what you want and click **Draft**. The text is added to the end of the doc.

This is the one time a doc's text leaves your browser. Your instruction goes to the workspace's AI provider for that single request, and so does the doc's current text if **Use what's already in this doc as context** is on. The result is encrypted in your browser before it's saved.

## If unlocking fails

| What you see | What to do |
|---|---|
| This wallet doesn't unlock your keys yet | Your keys were set up with another wallet. Unlock once with that one and add this wallet to your keys (see [Signing in](signing-in.md#add-a-wallet-to-your-keys)). If you no longer have it, restore from your recovery kit |
| Your keys were set up with a wallet that's no longer linked to your account | Restore from your recovery kit, or start over with new keys |
| Your wallet's signature doesn't open your keys here | The workspace moved to a new web address since your keys were set up. Restore from your recovery kit. If it didn't move, tell your admin |
| The server lists different keys for you than the ones your wallet unlocks | If you didn't start over with new keys on another device, tell your admin before you do anything else. The same goes for "than the ones your passkey unlocks" |
| Your keys seem to be missing from the server | The server lists no keys and no wallet copies for you, though this browser has seen you hold keys here. If one of your passkeys still works, unlock with it. Otherwise restore from your recovery kit. Start over with new keys only if you reset them yourself; otherwise tell your admin first |
| No passkey was used | You cancelled, or none of your passkeys is on this device or in this passkey manager. A passkey only works at the web address it was made on, so after the workspace moves, unlock with your wallet or recovery kit and add new passkeys |
| That passkey doesn't open your keys here | The passkey's copy of your keys was damaged, or the workspace lost its signing key. Unlock with your wallet, or restore from your recovery kit |
| Your wallet signs the same message differently each time | That wallet can't hold your keys. Use another linked wallet, such as MetaMask, Rabby, Ledger or Trezor |
| Your wallet returned a signature Nil can't read | Smart wallets, including passkey wallets, can't hold encryption keys yet. Use a regular wallet |

When this wallet can't open your keys, **Restore from your recovery kit** appears under the message. Pick the kit file, type its passphrase and click **Restore**. Your keys come back, and the wallet in your browser unlocks them from then on. If the kit holds different keys from the ones on record for you, Nil says so and offers **Use the kit's keys instead**. Teammates are then asked to confirm the change.

With no recovery kit and no wallet that holds your keys, click **Start over with new keys** and confirm. You get new keys and lose access to everything sealed to the old ones. Teammates see your key as changed, and nothing is shared with you until they confirm it. Team docs then come back on their own. Docs shared with specific people have to be shared with you again, and [private tasks](private-tasks.md#if-a-private-task-wont-open) come back once the other person on each task has confirmed your new key.

## How it works

Your keys come from a random seed your browser makes the first time you unlock. The server keeps that seed only locked to each wallet you've added to your keys, under a key made from that wallet's signature of its unlock message, and to each passkey you've added, under a key made from that passkey's PRF output. Neither ever leaves your browser, so the server can't open the seed. The messages name the workspace by its signing key, not its name, so renaming the workspace changes nothing.

Each doc has its own random AES-256-GCM key. The title and the body are signed with the writer's Ed25519 key, together with the audience, the readers, a SHA-256 hash of the doc key and the time, then encrypted separately, each bound to the doc, the field and the version number through associated data. The doc key is sealed to every reader on its own: a throwaway X25519 key pair agrees on a secret with the reader's public key, HKDF-SHA256 turns it into a wrapping key, and AES-256-GCM wraps the doc key. [Encryption and trust](encryption.md) covers the whole design, including what a server operator can still do.

The server stores the ciphertext, the sealed keys, who can read each doc, who changed it and when, and up to 25 encrypted earlier versions. A save that starts from an outdated version is refused rather than overwriting someone else's work.
