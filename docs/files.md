# Files

Files is where your team keeps the files only some people should open: contracts, designs, recordings, exports, scans. Every file is encrypted in your browser before it leaves, its name, type and pixel size included. The server stores scrambled bytes it has no key for.

Files are for members. Guests don't get them.

## Open Files

Click **Files** in the sidebar, or press `G` then `F`. Files uses the same keys as [Docs](encrypted-docs.md) and [private tasks](private-tasks.md), so if they're unlocked in this tab, Files opens straight away. If not, click **Unlock with your wallet**, or **Unlock with a passkey** if you've added one. [Unlock docs](encrypted-docs.md#unlock-docs) explains what your wallet signs.

## Shared folders

Everything in Files lives in a shared folder. Click **New folder**, give it a name and choose who can open it:

- With **Whole team**, everyone in the workspace can open it, add files and change them. Someone who sets up keys later gets the folder once a teammate has confirmed their key and opens Files.
- With **Specific people**, only the people you tick can. Tick nobody to keep a folder for yourself.

Inside a shared folder you can make as many folders as you like, nested as deep as you need. They're open to the same people as the folder they're in.

A folder listed as "Encrypted folder" with "Waiting for a key from" and a name was shared with the team before you set up your keys. A teammate's browser hands you the key once that teammate has confirmed your key and opens Files. If it's taking a while, ask them to check your fingerprint.

## Add files

Open a folder and do any of these:

- Click **Upload** and pick one or more files, or click the folder button next to it to pick a whole folder.
- Drag files or folders from your computer onto the page. Drop them on a folder to put them in that folder.
- Copy files or a screenshot and paste them with `⌘V` or `Ctrl+V`.

A folder from your computer comes in with everything inside it: its folders are made first, encrypted like any other, and then its files go up into them. Empty folders come too. It has to fit in the shared folder, which holds up to 5,000 files and folders and nests them up to 32 deep unless whoever runs the server changed that.

Files go up a few at a time. The tray at the bottom of the screen shows each one's progress, with a button to stop it, and to try again if one fails. Uploads carry on while you move between folders, and while your connection drops: an upload waits until you're back online. If one fails anyway, **Try again** carries on from where it stopped instead of starting over, as long as the file on your computer hasn't changed. Uploads stop if you close the tab.

An upload that never finished, because a tab was closed part way, still takes up its full size of your file space until the server lets it go, after 30 minutes untouched. Files names any you have under your folders, with **Discard now** to let them go at once.

Your browser encrypts each file in pieces of 1 MB as it sends it, so even a large file never has to fit in memory at once. The largest file a server takes is set by whoever runs it, 2 GB unless they changed it.

### Photos

Photos carry details you can't see: the camera, the time, and often the place they were taken. Before a JPEG, PNG, WebP or GIF is encrypted, your browser takes those details out of the file itself: the Exif and GPS data, XMP, IPTC, comments, and the extra pictures some phones tuck in after the photo. The picture is left exactly as it was, so its quality, its colours and any animation stay. A JPEG keeps one note, which way up it goes.

- A picture too damaged to clean that way is drawn again with nothing but its pixels, which keeps only the first frame of an animation and scales anything over about 16.7 megapixels down. If even that fails, Nil doesn't upload it rather than send it with its details. Save it again in another app and try once more.
- HEIC, AVIF, TIFF, camera RAW files and other formats Nil can't clean are uploaded as they are, with whatever details they hold, so originals stay untouched. Export a JPEG first if those details matter.

Word, Excel and PowerPoint files lose who wrote them, who last saved them and when, and the company, template and custom fields they carry. Everything else in them is copied as it is, so they open exactly as before. PDFs and every other kind of file are uploaded as they are, with whatever their author put in them.

Images also get a small thumbnail, made in your browser and encrypted like the image itself, so the grid shows a picture without fetching the whole file.

## Find and arrange files

The buttons above a folder switch between a grid and a list, and the menu next to them sorts by name, by when things changed, by size or by type. Folders always come first.

**Search this folder** looks through the names your browser decrypted, in the folder you're in and every folder inside it. The server never sees what you search for.

To work on several at once, hold `Ctrl` (or `⌘` on a Mac) and click each one, or tick the box that shows on a file when you point at it. `Shift`-click picks everything between the last one you picked and this one, and the box at the top of the list picks everything shown. While anything is picked, a click picks instead of opening, and the toolbar turns into **Download**, **Move to…** and **Delete** for all of them. The cross at its left, or `Esc`, lets them go. You can also drag several picked files onto a folder.

Each file and folder has a menu, the three dots, with everything you can do to it:

| Action | What it does |
|---|---|
| Preview or Open | Shows the file, or opens the folder |
| Download | Saves the file on your device, decrypted. A folder downloads as a zip of everything in it |
| Rename | Gives it a new name |
| Move to… | Moves it into another folder in the same shared folder |
| Delete | Moves it to the trash for everyone, a folder with everything in it |

You can also move a file or folder by dragging it onto a folder in the grid or list, or onto a folder in the path at the top. Only whoever added something, the folder's creator or an admin can delete it, and [Trash](#trash) brings it back.

The menu at the right of the toolbar renames the shared folder, and, for its creator or an admin, deletes it with everything in it.

## Preview and download

Clicking a file previews it in a window over the page. The file is decrypted in your browser and shown there; nothing is sent anywhere to show it. The arrows in the window, or the left and right arrow keys, move to the previous or next file.

| Kind of file | Preview |
|---|---|
| Images (JPEG, PNG, GIF, WebP, AVIF) | Fitted to the window, with zoom |
| PDF | Page by page, with zoom. Forms show as they're filled in, but you can't type into them, and a PDF's scripts never run |
| Word (.docx) | The text, headings, lists, tables and pictures, in a simplified layout. Links aren't clickable |
| Text, Markdown and code | As text, and Markdown formatted, up to 2 MB |
| Audio and video | Played by your browser, in the formats it supports |
| Anything else, SVG included | Its icon and a **Download** button |

Previews stop at 300 MB, since the whole file has to be decrypted into the tab first. Larger files can still be downloaded.

**Download** saves the file decrypted, under its own name. Very large files are written to disk a piece at a time where the browser allows it (Chrome and Edge ask where to save them), and a file that doesn't match what its uploader signed is thrown away before it's kept. Elsewhere the file is put together in memory first and handed to your downloads.

**Download** with several picked, or on a folder, makes one zip of them, decrypted in your browser. Each file in it is checked against what its uploader signed as it goes in, and a file that doesn't match stops the zip rather than end up in it. Its progress shows in the tray, with a button to stop it. A large zip is written straight to disk where the browser allows it, as for one large file. Elsewhere it's put together in memory, up to 500 MB unless whoever runs the server changed that. Locked files are left out, and Files says how many. Names are made safe to unpack anywhere: no slashes, no characters Windows refuses, and a second file with the same name in a folder gets a number.

SVG files are never shown as images, because an SVG can carry a script. They're plain files you can download.

## Keyboard

Click a file or folder, or tab to it, and then:

| Keys | What it does |
|---|---|
| Arrow keys | Move between files and folders |
| `Home`, `End` | Go to the first or last |
| `Enter` | Open the folder or preview the file |
| `Space` | Pick it, or let it go. With `Shift`, pick everything from the last one picked |
| `Ctrl+A`, or `⌘A` on a Mac | Pick everything shown |
| `Esc` | Let go of everything picked |
| `F2` | Rename it |
| `Delete`, or `⌘Backspace` on a Mac | Delete it, or everything picked, after asking |
| `Backspace` | Go up one folder |

In a preview, the left and right arrow keys move between files, `+` and `-` zoom an image or PDF, `0` fits it again, `Page Up` and `Page Down` turn the pages of a PDF, and `Esc` closes the window.

## Who can open a folder

The button showing **Team** or a number of people opens **Who can open this folder**. It works like sharing a doc:

- Anyone who can open a team folder can hand it to teammates whose key they've confirmed. Only the folder's creator or an admin can switch a folder between the two choices, add people to a folder for specific people, or take people out.
- Before a folder's key is sealed to someone new, Nil asks you to check their key, the same check as for docs. [Check your teammates' keys](encrypted-docs.md#check-your-teammates-keys) explains how.
- Taking someone out gives the folder a new key, every file's own key is wrapped again under it, and every file's details are encrypted again under it. Then every file in the folder is encrypted again under a fresh key of its own, by the browsers of the people who stay, a few at a time in the background. The folder says how many are left while that runs, and anything still waiting can't be moved or renamed until it's done.

Once a file has been encrypted again, the copy the server keeps opens only with its new key, so a key the person kept opens nothing the server still holds. People you take out keep whatever they downloaded or previewed before, and that can't be taken back.

## Trash

Deleting a file or folder moves it, with everything in it, to the shared folder's trash for everyone. It stays there for 30 days (the server's `FILES_TRASH_DAYS`), then it's deleted for good. Open **Trash** from the folder's ⋯ menu to bring something back where it was, or to delete it for good now. If the folder it was in is in the trash too, it comes back at the top of the shared folder.

Only whoever added something, the folder's creator or an admin can rename, move or delete it, and only they, or whoever deleted it, can restore it or delete it for good. Deleting a folder that holds other people's files takes the folder's creator or an admin.

## Signed files

Whoever adds a file signs its name, type, size, place, a fingerprint of its contents, a fingerprint of each 1 MiB piece of it, and a fingerprint of its thumbnail, with the same signing key that signs their docs. A preview or download checks each piece as it arrives, and a thumbnail that isn't the one its uploader signed is never shown. Renaming or moving a file signs its details again, as the person who changed them. Your browser checks every signature against the keys you can see for your teammates:

- A file or folder whose details don't check out shows as **Locked file** and can't be opened. Its creator or an admin can delete it.
- A file whose contents don't match the fingerprint its uploader signed won't preview or download. The server may have changed it.
- A warning sign on a file means the server sent older details than this browser has already seen for it.

A shared folder's name is signed too, by its creator or an admin, together with who the folder is for, which key protects it and which of the folder's keys that is. A name anyone else signed doesn't count, so no other reader can make a folder a team folder. If the name doesn't check out, the folder says "Nil can't confirm the folder's creator or an admin named this folder". If the server shows an older key than this browser has already seen, the folder says it's an older version, and nothing is added to it. Files in it that do check out still open, but nothing new is added or shared under its key until its creator or an admin gives it a new one under **Who can open this folder**.

## Your file space

The bar under your folders shows how much of your file space you use. It counts the files you uploaded to Files and to docs, the files you sent in chat, and the files you attached to tasks, as the server stores them, along with changes you typed into docs that no saved version holds yet. When those fill your space, your browser saves the doc as a new version instead of sending each change live, which gives the space back. Whoever runs the server sets how much each person gets, 2 GB for a member unless they changed it, and how much the whole workspace can keep.

## What the server can see

The server never sees a file's name, type, contents, thumbnail or pixel size, or a folder's name. It does see:

- which shared folders exist, who can open each one and who made it,
- how many files and folders each holds, which items are folders, and how they nest,
- each file's size, to within 16 bytes per megabyte, and which files have a thumbnail, which says they're images,
- who added, renamed, moved or deleted something, and when.

[Privacy model](privacy-model.md) lists what the server can read across Nil, and [Encryption and trust](encryption.md#files-and-sealed-blobs) explains the design, byte by byte.
