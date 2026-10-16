# Sharing and guests

There are three ways to show work to people outside your team: make them a guest, send a read-only share link, or list a bounty on the [public bounty board](public-bounty-board.md).

## Guests

A guest is someone with an account who sees only part of the workspace: the projects shared with them and any task assigned to them. Use it for clients, contractors and freelancers.

Guests can open, create and work on tasks in their projects, comment, track their own time and download their own proofs of work. They can't see Docs, Goals or Votes, can't create share links or projects, and their Settings show only **Profile**, **Sign-in & security** and **Connect AI**. Of the people in the workspace, they see the admins and the people on their tasks.

Guests never take a paid seat on servers that charge for [Nil Pro](nox-and-nil-pro.md).

### Invite a guest

1. Open **Settings → Team**.
2. Under **Invite people**, choose **Guest** as the role.
3. Click **Pick projects** and tick the projects they may see.
4. Click **Create invite link** and send the link privately.

To change a guest's projects later, find them under **Members** and click the projects button next to their role. The change applies the next time their app asks the server for anything, and updates from other projects never reach them.

An applicant you accept from the public bounty board also becomes a guest. They see only the task they were given, not its project.

## Read-only share links

A share link shows one project or one task to anyone who has the link, without signing in. Use it for an investor update or a client who only needs to see progress.

Share links are off until an admin turns on **Allow read-only share links** in **Settings → Team → Sharing**. Then any member can make one:

- For a project, click the share icon at the top of the project page.
- For a task, open it, click the three-dot menu and choose **Share read-only link**.

Pick how long the link works (7, 30 or 90 days) and click **Create link**. Nil copies it for you. The same window lists the active links, how many times each was viewed, and a **Revoke** button. Whoever made a link, or an admin, can revoke it.

### What a share link shows

| | Project link | Task link |
|---|---|---|
| Shows | The project's name, how many of its tasks are done, and each task's key, title, status, priority and due date | The task's key, title, status, priority, due date, description, checklist progress and bounty |
| Never shows | People, comments, files, wallet addresses, private tasks or canceled tasks | People, comments, files or wallet addresses |

A private task can't be shared at all. Search engines are told not to index share pages.

Turning **Allow read-only share links** off disables every existing link at once. Links are stored only as hashes, so a copy of the database doesn't reveal them.
