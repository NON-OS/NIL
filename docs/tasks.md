# Tasks

## Create a task

Press `C` anywhere in Nil, or click **New task**. Type a title and press Enter, or click **Create task**.

You can set most fields while you type the title. Nil picks these out and shows each one as a chip under the title:

| Type this | To set | Examples |
|---|---|---|
| A date | Due date | `today`, `tomorrow`, `friday`, `next week`, `in 3 days`, `oct 20`, `2026-11-02`, `eow` (end of week), `eom` (end of month) |
| `!` and a priority | Priority | `!urgent`, `!high`, `!medium`, `!low`, or `p1` (urgent) to `p4` (low) |
| `#` and a label | Label | `#bug` |
| `+` and a project key or name | Project | `+web` |
| `@` and a name | Assignee | `@ana`, or `@me` for yourself |
| How often it repeats | Repeat | `daily`, `weekdays`, `every week`, `every 2 weeks`, `monthly` |

For example, `Send investor update friday !high +GE @me every week` creates a task called "Send investor update", due Friday, high priority, in the project with the key GE, assigned to you and repeating every week.

A few details:

- Labels and projects must already exist. Labels live in **Settings → Labels**.
- A short day name only counts as a date after "on", "by", "due" or "next", so a title like "Sun damage report" stays as it is.
- Whatever you pick with the buttons under the title wins over what you typed.

Turn on **Create more** to keep the box open for the next task. Click **Private** to make the task [private and encrypted](private-tasks.md) from its first save.

On **My work**, the box at the top of **Assigned to me** creates a task for yourself and understands the same words.

## The task panel

Click a task to open its panel. At the top you can change:

| Field | Choices |
|---|---|
| Status | Backlog, To do, In progress, In review, Done, Canceled |
| Priority | Urgent, High, Medium, Low, No priority |
| Assignee | Anyone in the workspace |
| Due and Start | A date |
| Repeat | See [Repeating tasks](#repeating-tasks) |
| Project and Goal | One of each |
| Labels | Any number |
| Visible to | Everyone, or only the creator and the assignee. See [Private tasks](private-tasks.md) |
| Bounty | Set by admins. See [Bounties and payouts](bounties-and-payouts.md) |
| Estimate | 1, 2, 3, 5, 8 or 13 points |

Below the fields are the description, the checklist, files and the activity history with comments. Descriptions and comments understand Markdown, such as `**bold**`, `_italic_`, lists that start with `-`, and links written as `[text](https://example.com)`. Click the description to edit it, and press `Ctrl+Enter` (`⌘ Enter` on a Mac) to save or `Esc` to cancel.

The icons along the top of the panel start a [timer](time-and-reminders.md), set a [reminder](time-and-reminders.md#reminders), add the task to My Day (the sun) and follow or unfollow the task (the bell). The menu with three dots has **Copy link**, **Share read-only link** when share links are on, **Duplicate** and **Delete task**. Click the task key, such as NON-42, to copy it.

## Comments and mentions

Write a comment at the bottom of the panel and press `Ctrl+Enter` (`⌘ Enter` on a Mac) to send it. Type `@` and a name to mention someone. They get a notification and start following the task.

People who follow a task hear about new comments and status changes. You follow a task automatically when you create it, when it's assigned to you, when you comment on it and when someone mentions you in it. The bell icon turns this on or off.

## Files

Drop files onto the task panel, or click **Attach**. Files are stored on your server, up to 25 MB each unless the server allows more. Images and PDFs open in the browser. Other files download, so a file can never run inside Nil. Whoever uploaded a file, or an admin, can remove it.

Files aren't encrypted, which is why they can't be added to a private task.

## Repeating tasks

Set **Repeat** to Every day, Every weekday, Every week, Every 2 weeks or Every month. When you mark a repeating task done, Nil creates the next one with the next due date. If you finished late, the new due date skips forward past today, so the new task isn't overdue the moment it appears. Its checklist starts unticked.

A task that gets a repeat but has no due date is given today as its due date.

## Change many tasks at once

In **All tasks** and in a project's list, tick the box at the start of a row, or press `X` on the row that has focus. Shift-click a box to select a range. A bar appears where you can change the status, priority, assignee, project, due date or labels of every selected task, or delete them all.

## Delete a task

Choose **Delete task** in the three-dot menu. A message with **Undo** appears for a few seconds. After that the task sits in the trash, where nobody can see it, and is erased for good after 30 days (the server operator can change this).

## Export tasks

**Export** at the top of All tasks, or **Export tasks (CSV)** in **Settings → Data & privacy**, downloads every task you can see as a spreadsheet. Private tasks appear as "Private task (encrypted)" because the server can't read them.
