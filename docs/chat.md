# Chat

Chat is where your team talks: channels for the whole team or for a few people, direct messages, and small group messages, with threads, reactions and files. Every message is encrypted in your browser before it's sent. The server passes on ciphertext it has no key for, and that includes channel names and topics, reactions, file names and the files themselves.

Chat is for members. Guests don't get it, the same as docs, and agents are never part of a conversation, since they hold no keys to read with.

## Unlock chat

Open **Chat** and click **Unlock with your wallet**, or **Unlock with a passkey** if you added one. These are the same keys as [docs](encrypted-docs.md) and [private tasks](private-tasks.md), so if they're already unlocked in this tab, chat opens straight away. They stay in the tab's memory, so you unlock again after closing or reloading it. If your keys won't unlock, the Docs screen has the ways to recover them.

The list of conversations and their unread counts show in the sidebar before you unlock, because the server knows them. Names and messages appear once you unlock.

## Start a conversation

Click the plus button above the list, or the small plus next to **Channels** or **Direct messages**.

- A channel has a name and, if you like, a topic. Pick **The whole team** and everyone on the team is in it, including people who join later. Pick **Only the people I pick** and you choose who is in it.
- A direct message is between you and one other person. There is only ever one between two people; starting another opens the one you have.
- A group message is for 3 to 12 people (your server can set another number with `CHAT_GROUP_MAX`). It can have a name.

You can also choose how long messages stay (see [Disappearing messages](#disappearing-messages)).

Before anything is sealed to someone, Nil asks you to compare their key fingerprint with them, the same check as for docs. A team channel skips the question and is sealed to everyone whose key you've already confirmed. Anyone else waits for a key, and gets it once you or a teammate confirm theirs.

## Write

Type in the box at the bottom and press `Enter` to send. `Shift+Enter` starts a new line.

Type `@` and a few letters to mention someone in the conversation. They get a notice even in a busy channel, and the message is marked for them.

To attach files, click the paper clip, paste them, or drop them on the conversation. Up to 10 go with one message, each as large as your server allows for task files. Pictures in JPEG, PNG, WebP and GIF show in the conversation. Before a picture is encrypted, Nil removes what it carries besides the picture: where it was taken, when, and on which camera. A photo keeps only the note that says which way up it goes. Kinds of picture Nil can't clean, such as HEIC or TIFF, aren't sent at all; save them as a JPEG first.

Links are clickable and open in a new tab, but Nil never fetches a preview. A preview would have the server visit the link, and that would tell it what you're reading.

### Threads, reactions and edits

Point at a message, or move to it with the keyboard, for its buttons:

- the smiley adds a reaction; click a reaction to add yours or take it back,
- the speech bubble opens a thread beside the conversation, where replies don't crowd the channel,
- on your own messages, the pencil edits and the bin deletes.

An edited message says so. A deleted one leaves a line saying it was deleted, and its files are removed from the server. Only whoever sent a message can edit or delete it.

### Offline

Write while you're offline and the message shows as queued. It goes as soon as you're back, in the order you wrote. Queued messages live in the tab's memory only, so they're lost if you close it before they go. A message the server refuses stays on screen with **Try again** and **Discard**.

## Read

A conversation with something new is bold in the list and shows a count. Opening it marks it read on all your devices, and a **New** line shows where you left off. The count is for messages in the conversation itself; replies in a thread show on the message they're under.

Scroll up and older messages load. Long conversations stay quick, because only the messages near the screen are kept in the page.

### Keyboard

| Keys | What it does |
|---|---|
| `⌘K` (Mac) or `Ctrl+K` | Jump to a conversation by name |
| `Alt+↑` and `Alt+↓` | The conversation above or below in the list |
| `Alt+Shift+↑` and `Alt+Shift+↓` | The next conversation with something unread |
| `↑` in an empty box | Edit your last message |
| `↑` and `↓` in the messages | Move from message to message |
| `Home` and `End` in the messages | The first or the newest message |
| `E` | Edit the message that has focus, if it's yours |
| `R` | Reply to it in a thread |
| `Esc` | Back to writing, or close the thread |

`G` then `K` opens chat from anywhere in Nil.

## Search

The box above the list finds conversations by name, and from two letters on it also finds words in messages. Like docs search, it runs in your browser over messages this tab has decrypted: the server never sees what you look for. Messages you haven't scrolled to in this tab aren't searched, so scroll back in a conversation to search further.

## Notifications

While Nil is open, a short notice says when someone writes to you directly, in a group, or mentions you in a channel, with a button to open it. Notices never quote the message.

On devices where you [turned on push notifications](time-and-reminders.md#push-notifications), you get them while Nil isn't open. A chat notification says only "New message". It carries no words, no channel name and not even who wrote, since a lock screen is seen by anyone nearby and the push service carries it. Nil sends at most one a minute for each conversation (`CHAT_PUSH_QUIET_SECONDS`).

Each conversation's settings let you choose what notifies you: the default (every message in direct and group messages, mentions in channels), every message, only mentions, or nothing.

To know whom a mention should reach, the sender's browser tells the server who it mentions. The server learns that much, and never the message.

## Disappearing messages

In a conversation's settings, whoever manages it can make new messages disappear after an hour, a day, 7, 30 or 90 days. In a direct message both people can. The time is part of each message, signed by its sender, so every browser hides a message once its time is up even if a server kept it, and the server deletes it, with its files and any thread under it.

A disappearing message is gone from the server and from every browser showing it, but anyone could have copied it, or taken a screenshot, before then.

## Manage a conversation

The sliders button at the top right opens its settings. A channel is managed by whoever made it and by the workspace's admins; everyone in a group manages it together. There they can rename it, change the topic, add people and take people out.

People added to a channel or group can read back through what was said before, as far as the person who added them can. Taking someone out starts a new key without them. They can't read anything sent after that, but what they could read before, they still can. Anyone can leave a channel for some people or a group; a team channel can't be left, only muted.

Deleting a channel deletes every message and file in it for everyone. Only whoever manages it can.

## Keys and what your browser checks

Each conversation has a key, made in the browser of whoever started it and sealed to each member's own key. After a while that key is replaced: when someone leaves or is taken out, when someone joins, and at least every 7 days (`CHAT_EPOCH_DAYS`). Each key's stretch of time is called an epoch, and settings show which epoch a conversation is on, who started it and when.

Every epoch has a list of who holds its key, signed by whoever started it, and each list names the one before. Your browser checks every list from the first: the signature, and that the person who signed was allowed to make that change. Only a manager can take someone out or change who manages it. Anyone in a conversation can start a new key for the same people, and in a team channel bring in a teammate. Your browser only accepts a key whose hash the list names, so the server can't hand you a key of its own.

Every message, reaction, edit and deletion is signed by its sender for that workspace, conversation, epoch, message, sender and time, and encrypted with all of those as additional data. A message opens only when its sender is on that epoch's list and the signature checks out against a key you can see for them. One that doesn't is shown as "Nil couldn't confirm who wrote this" and its words stay hidden.

Each browser tab also numbers what it sends in each conversation, 1, 2, 3 and so on, and signs the number. If the server holds a message back, sends one twice, or changes the order, the numbers show it, and the conversation says so at the top. The same notice appears if a list of who holds the key doesn't check out, or if the server shows a different history of who was in the conversation than it did before.

Compare key fingerprints with your teammates, face to face or on a call. Until you do, a teammate's first key counts for their messages while it's listed for an active member, as with docs, and the key notice at the top of the conversation asks you to check it. Nothing is sealed to a key you haven't confirmed.

## What the server can see

The server can't read messages, reactions, file names, files, or channel names and topics. It can see:

- who is in which conversation, who started it, and whether it's a channel for the team, for some people, a direct or a group message,
- when each message, reaction, edit and deletion was sent, by whom, into which conversation and which thread, and its size to within a few bytes,
- that something is a reaction rather than a message, and which message it's on, but not the emoji,
- the size of every file and which message it belongs to,
- who each sender mentioned, when they mention someone,
- how far each person has read, and their notification choice,
- each conversation's disappearing setting, and each epoch's signed list of who holds its key,
- who is typing, while they type.

[Encryption and trust](encryption.md#chat) has the details of the scheme, and [Privacy model](privacy-model.md) the full list for the whole app.

## Limits

- There is no forward secrecy within an epoch. Anyone who gets hold of an epoch's key, from a member's unlocked browser say, can read everything sent under it, and a member who was taken out can still read, with the server's help, what was sent while they were in. A new epoch at least every week keeps that window short. Messaging Layer Security (MLS, RFC 9420), which replaces keys with every change and heals after a compromise, is the next step. We looked at ts-mls, a TypeScript implementation; it's young and has no published independent audit, so chat doesn't rely on it yet.
- The numbering catches a message held back between two others, but not the very last thing a tab sent, if the server never delivers it and the tab sends nothing after it.
- When someone leaves a conversation on their own, or is removed from the team, the new key starts the next time the browser of someone who manages it opens the conversation. Until then only the server keeps them from later messages. Taking someone out in the settings starts the new key at once.
- Search covers only what this tab has decrypted.
- Mentions tell the server who was mentioned, so push notifications can reach them.
- A queued message is in the tab's memory only, so closing the tab loses it.
- Like the rest of Nil, chat trusts the app your server sends. [Check what a server sends](verify-a-server.md) explains how to compare it with a release.
