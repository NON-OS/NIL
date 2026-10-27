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

- Click **Upload** and pick one or more files.
- Drag files from your computer onto the page. Drop them on a folder to put them in that folder.
- Copy files or a screenshot and paste them with `⌘V` or `Ctrl+V`.

Files go up a few at a time. The tray at the bottom of the screen shows each one's progress, with a button to stop it, and to try again if one fails. Uploads carry on while you move between folders. They stop if you close the tab.

Your browser encrypts each file in pieces of 1 MB as it sends it, so even a large file never has to fit in memory at once. The largest file a server takes is set by whoever runs it, 2 GB unless they changed it.

Dropping a whole folder from your computer isn't supported yet. Open it and drop the files inside.

### Photos

Photos carry details you can't see: the camera, the time, and often the place they were taken. Before a JPEG, PNG or WebP image is encrypted, your browser draws it again with nothing but its pixels, turned the right way up, so none of those details are uploaded. Some things to know:

- A photo larger than about 16.7 megapixels is scaled down to that size first, since some browsers can't redraw anything larger.
- An animated WebP or PNG keeps only its first frame.
- If your browser can't save WebP, the photo becomes a PNG, and its name says so.
- If a photo can't be read at all, Nil doesn't upload it rather than send it with its details. Save it again in another app and try once more.
- Other formats, such as GIF, HEIC, AVIF and TIFF, are uploaded as they are, with whatever details they hold.

Images also get a small thumbnail, made in your browser and encrypted like the image itself, so the grid shows a picture without fetching the whole file.

## Find and arrange files

The buttons above a folder switch between a grid and a list, and the menu next to them sorts by name, by when things changed, by size or by type. Folders always come first.

**Search this folder** looks through the names your browser decrypted, in the folder you're in and every folder inside it. The server never sees what you search for.

Each file and folder has a menu, the three dots, with everything you can do to it:

| Action | What it does |
|---|---|
| Preview or Open | Shows the file, or opens the folder |
| Download | Saves the file on your device, decrypted |
| Rename | Gives it a new name |
| Move to… | Moves it into another folder in the same shared folder |
| Delete | Deletes it for everyone, and a folder with everything in it |

You can also move a file or folder by dragging it onto a folder in the grid or list, or onto a folder in the path at the top. Only whoever added something, or an admin, can delete it. Deleting can't be undone.

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

SVG files are never shown as images, because an SVG can carry a script. They're plain files you can download.

## Keyboard

Click a file or folder, or tab to it, and then:

| Keys | What it does |
|---|---|
| Arrow keys | Move between files and folders |
| `Home`, `End` | Go to the first or last |
| `Enter` | Open the folder or preview the file |
| `F2` | Rename it |
| `Delete`, or `⌘Backspace` on a Mac | Delete it, after asking |
| `Backspace` | Go up one folder |

In a preview, the left and right arrow keys move between files, `+` and `-` zoom an image or PDF, `0` fits it again, `Page Up` and `Page Down` turn the pages of a PDF, and `Esc` closes the window.

## Who can open a folder

The button showing **Team** or a number of people opens **Who can open this folder**. It works like sharing a doc:

- Anyone who can open a team folder can hand it to teammates whose key they've confirmed. Only the folder's creator or an admin can switch a folder between the two choices, add people to a folder for specific people, or take people out.
- Before a folder's key is sealed to someone new, Nil asks you to check their key, the same check as for docs. [Check your teammates' keys](encrypted-docs.md#check-your-teammates-keys) explains how.
- Taking someone out gives the folder a new key, and every file's own key is wrapped again under it. They can't open files added after that.

People you take out keep whatever they downloaded or previewed before. Each file keeps its own key when the folder gets a new one, so someone who opened a file before can still read that same file, and its later name, if they kept its key and the server hands them its encrypted copy. Taking someone out stops them fetching it from Nil, and it keeps everything added afterwards from them.

## Signed files

Whoever adds a file signs its name, type, size, place and a fingerprint of its contents, with the same signing key that signs their docs. Renaming or moving a file signs its details again, as the person who changed them. Your browser checks every signature against the keys you can see for your teammates:

- A file or folder whose details don't check out shows as **Locked file** and can't be opened. Its creator or an admin can delete it.
- A file whose contents don't match the fingerprint its uploader signed won't preview or download. The server may have changed it.
- A warning sign on a file means the server sent older details than this browser has already seen for it.

A shared folder's name is signed too, together with who the folder is for and which key protects it. If it doesn't check out, the folder says "Nil can't confirm a teammate named this folder". Files in it that do check out still open, but nothing new is added or shared under its key until its creator or an admin gives it a new one under **Who can open this folder**.

## Your file space

The bar under your folders shows how much of your file space you use. It counts the files you uploaded to Files and to docs, and the files you attached to tasks, as the server stores them. Whoever runs the server sets how much each person gets, 2 GB for a member unless they changed it, and how much the whole workspace can keep.

## What the server can see

The server never sees a file's name, type, contents, thumbnail or pixel size, or a folder's name. It does see:

- which shared folders exist, who can open each one and who made it,
- how many files and folders each holds, which items are folders, and how they nest,
- each file's size, to within 16 bytes per megabyte, and which files have a thumbnail, which says they're images,
- who added, renamed, moved or deleted something, and when.

[Privacy model](privacy-model.md) lists what the server can read across Nil, and [Encryption and trust](encryption.md#files-and-sealed-blobs) explains the design, byte by byte.
