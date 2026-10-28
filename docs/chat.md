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

Before anything is sealed to someone, Nil asks you to compare their key fingerprint with them, the same check as for docs. You can't write in a conversation, team channels included, until you've checked the key of everyone who holds its key, since whoever holds it reads what you write: the conversation names whose keys are left to check, with **Check keys**. Starting a team channel skips the question and seals it to everyone whose key you've already confirmed. Anyone else waits for a key. In a team channel they get it once you or a teammate confirm theirs; anywhere else, whoever manages the conversation gives it with **Give key** in its settings, after checking their key.

## Write

Type in the box at the bottom and press `Enter` to send. `Shift+Enter` starts a new line.

Type `@` and a few letters to mention someone in the conversation. They get a notice even in a busy channel, and the message is marked for them.

To attach files, click the paper clip, paste them, or drop them on the conversation. Up to 10 go with one message, each as large as your server allows for task files. Pictures in JPEG, PNG, WebP and GIF show in the conversation. Before a picture is encrypted, Nil removes what it carries besides the picture: where it was taken, when, and on which camera. A photo keeps only the note that says which way up it goes, and anything stored after the picture itself, such as the extra frames of a motion photo, is cut off. Kinds of picture Nil can't clean, such as HEIC or TIFF, aren't sent at all; save them as a JPEG first.

Links are clickable and open in a new tab, but Nil never fetches a preview. A preview would have the server visit the link, and that would tell it what you're reading.

### Threads, reactions and edits

Point at a message, or move to it with the keyboard, for its buttons:

- the smiley adds a reaction; click a reaction to add yours or take it back,
- the speech bubble opens a thread beside the conversation, where replies don't crowd the channel,
- on your own messages, the pencil edits and the bin deletes.

An edited message says so. A deleted one leaves a line saying it was deleted, and its files are removed from the server. Only whoever sent a message can edit or delete it. Your browser remembers the newest edit of each message it has seen, and which were deleted, so a server can't show an older version or bring a deleted message back, in this tab or a later one. Each tab's signed mark (see [below](#keys-and-what-your-browser-checks)) also lists its own recent edits and deletions, so a device that never saw a change still can't be shown the message as it was before it.

### Offline

Write while you're offline and the message shows as queued. It goes as soon as you're back, in the order you wrote. A message is signed and encrypted the moment you send it, and kept on this device in that form until the server has it, so closing the tab or the browser loses nothing: it goes the next time you unlock. If the conversation got a new key meanwhile, or the message waited a while, your browser opens it and seals it again first. Coming back online, your browser also fetches whatever arrived in the conversations you have open while it was away. A message the server refuses stays on screen with **Try again** and **Discard**. Discarding sends a signed, empty placeholder in its place, so your teammates' browsers don't take its absence for a message the server held back.

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

The box above the list finds conversations by name, and from two letters on it also finds words in messages and file names. It runs in your browser, so the server never sees what you look for, and it covers every message this browser has ever opened, in any tab or visit. For that, your browser keeps an index on this device, encrypted under a key it derives from your unlocked keys and never stores: while your keys are locked, the index can't be read. Disappearing messages and forward-secret conversations never go into it, since someone who later stole your keys and this device would otherwise find them there; they're searched only while a tab holds them. Signing out deletes the index.

## Notifications

While Nil is open, a short notice says when someone writes to you directly, in a group, or mentions you in a channel, with a button to open it. Notices never quote the message. Your browser opens and checks the message first: a message that doesn't check out raises no notice, and a mention counts only when the sender signed it into the message.

On devices where you [turned on push notifications](time-and-reminders.md#push-notifications), you get them while Nil isn't open. A chat notification says only "New message". It carries no words, no channel name and not even who wrote, since a lock screen is seen by anyone nearby and the push service carries it. Nil sends at most one a minute for each conversation (`CHAT_PUSH_QUIET_SECONDS`).

Each conversation's settings let you choose what notifies you: the default (every message in direct and group messages, mentions in channels), every message, only mentions, or nothing.

To know whom a mention should reach, the sender's browser tells the server who it mentions. The server learns that much, and never the message.

## Disappearing messages

In a conversation's settings, whoever manages it can make new messages disappear after an hour, a day, 7, 30 or 90 days. In a direct message both people can. The time is part of each message, signed by its sender, so every browser hides a message once its time is up even if a server kept it, and the server deletes it, with its files and any thread under it.

A disappearing message is gone from the server and from every browser showing it, but anyone could have copied it, or taken a screenshot, before then.

## Forward secrecy

A conversation can be forward-secret. In its settings, whoever manages it (in a direct message, either person) picks how long old keys are kept: a day, 7, 30 or 90 days. Once a key was replaced longer ago than that, every sealed copy of it is deleted from the server, the messages sealed under it are deleted with it, and browsers forget it too. Someone who later steals a member's keys, or a copy of the server, finds nothing older to open.

It's a trade. Both settings are signed with the conversation's name by whoever set them. The server keeps its own copy to act on, and if it ever differs from the signed one, the conversation says so and Nil won't send there until it's set again.

In a forward-secret conversation, people who join can read back only as far as the old keys go, and nobody can scroll back further than that, you included. In a conversation that’s in use, keys change at least daily, so with a day of forward secrecy, nothing older than about two days can be opened by anyone. The name of the conversation stays readable until it's renamed, since whoever manages it seals it under the newest key as keys change. It pairs well with disappearing messages, which delete the words themselves on a schedule.

## Call from a conversation

The phone button at the top of a conversation calls everyone in it, and the camera button starts a video call. They show when [calls](calls.md) are set up on your server and the conversation is small enough for one call.

## Manage a conversation

The sliders button at the top right opens its settings. A channel is managed by whoever made it; everyone in a group manages it together, and so does everyone in a channel whose managers have all left. Who manages a conversation comes from its signed member list, never from the server's word on anyone's role, and a change to it shows in the timeline; the server takes a new name or settings only from them, and settings only together with the signed name. Workspace admins can still delete any channel. There they can rename it, change the topic, add people and take people out.

People added to a channel or group can read back through what was said before, as far as the person who added them can, or as far as a [forward-secret](#forward-secrecy) conversation still keeps. Taking someone out starts a new key without them. They can't read anything sent after that, but what they could read before, they still can, unless the conversation is forward-secret and its old keys have gone.

Anyone can leave a channel for some people or a group; a team channel can't be left, only muted. Leaving signs a statement in your browser that says you left. With it, any member's browser starts the conversation's next key without you, so nobody has to wait for whoever manages it. In the same way, when an admin removes someone from the team or makes them a guest, the admin's browser signs that they're out. Where the admin manages the conversation, any member's browser then starts the next key without them; elsewhere, the browser of someone who manages it does, once it has checked the admin's signature against a key it confirmed, and signs the next list as theirs. Until then the conversation says who still holds the key and waits. Who is an admin can change later, so it never decides whether a list in a conversation's history holds. In a team channel, whoever manages it also leaves out of the key anyone the team no longer lists, and can leave out someone nobody can confirm. An admin whose keys were locked at that moment sees a notice in Chat to sign it then.

Every change of who holds a conversation's key shows in its timeline: who added whom, who left, and who took someone out.

Until the new key starts, someone who left still holds the current one. The conversation says so, and nothing is sent there until the next key leaves them out; any member's browser starts it once their leaving is signed. In a team channel, whoever manages it also leaves out, on their own, anyone who is no longer on the team, signed statement or not, since a team channel's people are the team's. In a channel for some people, without a signed statement only whoever manages it can take them out.

If the lists of who holds a direct message's key ever stop checking out, nothing after the break can be trusted, and it can't be mended. **Start a fresh conversation** in its notice sets it aside and starts a new one with the same person, once you've checked their key again. The old one stays, with what can still be read in it.

Deleting a channel deletes every message and file in it for everyone. Only whoever manages it can.

## Keys and what your browser checks

Each conversation has a key, made in the browser of whoever started it and sealed to each member's own key. That key is replaced when someone joins, leaves or is taken out, when someone's keys change, and at least once a day (`CHAT_EPOCH_HOURS`, 24 by default): the first browser that sends after that starts the next one. Browsers count the time from when the list of who holds the key was signed, not from what the server says, and never keep a key on for more than a week, whatever the server is set to. Each key's stretch of time is called an epoch, and settings show which epoch a conversation is on, who started it and when.

Every epoch has a list of who holds its key, signed by whoever started it, and each list names the one before. Your browser checks every list from the first: the signature, and that the person who signed was allowed to make that change. A manager may take someone out. Anyone else may leave someone out only by citing that person's own signed leaving, or a signed removal from the team by someone who manages the conversation, signed since they last joined. Each list has to be newer than the one before, and none may be dated far ahead of your clock, nor, for the server, far back; whoever starts the next one dates it after the one before, so a list dated ahead can't hold the next one off. Nobody can start a new key for the same people except on schedule, or now and then when their copy of the key didn't open, and a conversation gets at most `CHAT_EPOCHS_PER_DAY` (200) new keys a day, at most `CHAT_EPOCHS_PER_PERSON_PER_DAY` (24) from any one person (a key that only leaves people out is never held back), so its history stays one any browser can check: a member who hands out a copy that doesn't open can't lock the others out, since their browsers start a new key of their own. The names and people a conversation shows come from its newest checked list, never from the server's. Anyone in a conversation can start a new key for the same people, and in a team channel bring in a teammate. Nobody comes into a private conversation, or is left out of one, just because the server's list says so. Your browser only accepts a key whose hash the list names, so the server can't hand you a key of its own. If someone hands over a copy that doesn't match, the copies others gave still count.

The server checks each list too, before it takes it: the signature against the key its signer published, that it follows the list before it and is newer, and the same rules about who may change what. It checks the signed statements that someone left the same way. That doesn't make it a judge of anything, since your browser checks again against the keys you confirmed, but it means a member can't file a list or a statement that every browser would refuse, which would otherwise stop the conversation for everyone.

Every message, reaction, edit and deletion is signed by its sender for that workspace, conversation, epoch, message, sender and time, and encrypted with all of those as additional data. A message opens only when its sender is on that epoch's list and the signature checks out against a key you can see for them. One that doesn't is shown as "Nil couldn't confirm who wrote this" and its words stay hidden. So is a message under a key dated after the next key started, and one the server placed after a message under a newer key: the server only takes messages under a conversation's newest key, so either went in late, with the help of someone who kept the old key, someone taken out, say.

The conversation's name and settings show only when they were signed while their key was the newest, and never older than ones your browser opened before. The server's copy of the settings has to match the signed one before anything is sent, from the conversation, a thread, a reaction or an edit alike, and a server showing the conversation as it was before its newest key, or a different history, stops sending too.

Your browser keeps the lists it checked on this device, so a later visit checks only what's new since, and whatever the server serves next still has to follow the newest list it kept. Signing out deletes them.

Each browser tab also numbers what it sends in each conversation, 1, 2, 3 and so on, and in each thread apart, and signs the number. If the server holds a message back, sends one twice, or changes the order, the numbers show it, and the conversation, or the thread, says so at the top. A moment after it sends, each tab also publishes its mark: how far it has numbered, signed and encrypted like a message. A mark ahead of the messages that arrived means the server held back the last ones, and that shows too. The same notice appears if a list of who holds the key doesn't check out, or if the server shows a different history of who was in the conversation than it did before.

When someone replaces their keys, the server keeps the old key with the wallet signature it was published with, so what they signed before still checks out, for a newcomer too, and only what was signed before the new key. In chat, someone who has left the team still counts as the author of what they signed while they were in, since every list and message is also held to who was in the conversation then.

Compare key fingerprints with your teammates, face to face or on a call. Until you do, a teammate's first key counts for their messages while it's listed for an active member, as with docs, and the key notice at the top of the conversation asks you to check it. Nothing is sealed to a key you haven't confirmed.

## What the server can see

The server can't read messages, reactions, file names, files, or channel names and topics. It can see:

- who is in which conversation, who started it, and whether it's a channel for the team, for some people, a direct or a group message,
- when each message, reaction, edit and deletion was sent, by whom, into which conversation and which thread, and its size to within a few bytes,
- that something is a reaction rather than a message, and which message it's on, but not the emoji,
- the size of every file and which message it belongs to,
- who each sender mentioned, when they mention someone,
- how far each person has read, and their notification choice,
- each conversation's disappearing and forward-secrecy settings, and each epoch's signed list of who holds its key,
- the signed statements that someone left a conversation or the team,
- when each tab last published its mark, and its size,
- who is typing, and in which thread, while they type.

[Encryption and trust](encryption.md#chat) has the details of the scheme, and [Privacy model](privacy-model.md) the full list for the whole app.

## Space and clean-up

Each person may keep up to `CHAT_MEMBER_MB` (1024 by default) on the server across chat: their encrypted messages, the member lists they signed, the keys they sealed and their marks; files count toward their file space instead. Each person may have made up to `CHAT_TEAM_CHANNELS_PER_PERSON` (25) channels for the whole team, since everyone is in those. Typing hints count only in a thread that exists. Each person keeps marks for up to 20 sending tabs in a conversation, so nobody can crowd out anyone else's. A conversation nobody can use any more is deleted with everything in it: a private one with nobody left, or one whose current key nobody holds, after someone was erased or started over with new keys. A direct message whose other person was erased lets go of the pair, so a new one can start.

## Limits

- Within an epoch, a key protects everything sent under it: anyone who gets hold of it, from a member's unlocked browser say, can read that day's messages. A member who was taken out can still read, with the server's help, what was sent while they were in, unless the conversation is forward-secret and those keys have gone.
- Keys don't heal after a theft. Each new epoch key is sealed to every member's long-term key, so someone who stole a member's identity keys can open new epochs too, until that member starts over with new keys. Messaging Layer Security (MLS, RFC 9420) would heal after a compromise and is the next step. We looked at ts-mls, a TypeScript implementation; it's young and has no published independent audit, so chat doesn't rely on it yet.
- The server sees when each tab publishes its mark. A server that holds back both a tab's last messages and every mark it publishes after them isn't caught until that tab, or another of the sender's, is seen sending again.
- The server says who is an admin. An admin's removal is acted on only by someone who manages the conversation and confirmed that admin's key, but an admin who agrees with the server could still sign one for someone who never left, and a manager's browser would act on it. The timeline shows it.
- While someone who left still holds a conversation's key and their departure counts only through someone who manages it, nothing is sent there until one of them is online.
- In a channel whose managers have all left, everyone manages it, so any one member can sign a list naming only themselves as manager and take the others out. The timeline shows it.
- Someone taken out of a conversation still has its old keys. A message they write under one, dated before they were out, can't be told from one they really sent then; the server only takes messages under a conversation's current key, so this needs the server's help.
- The very first list of who is in a conversation is taken on its signer's word: a newcomer can't tell a conversation the server forked from its start from the real one, though browsers that saw the real one notice.
- Mentions tell the server who was mentioned, so push notifications can reach them, and queued messages keep that list on this device until they're sent.
- Like the rest of Nil, chat trusts the app your server sends. [Check what a server sends](verify-a-server.md) explains how to compare it with a release.
