# Time and reminders

Your timesheet and your reminders are yours alone. Nobody else in the workspace can see them, admins included.

## Track time with the timer

Open a task and click the play button at the top of its panel. The timer runs at the bottom of the sidebar, where you can click the task name to open it or click stop. Click the play button on another task to switch the timer to it. You only ever have one timer running.

To track time without a task, click **Start timer** on the **Time** page. That entry is called "Focus time".

If you forget to stop a timer, its entry is cut to 24 hours when it does stop.

## Log time by hand

On **Time**, under **Log time**, fill in the day, the start and end times, a task (any open task assigned to you, or **No task**) and an optional note. Click **Log**. One entry can be at most 24 hours long, and it can't be in the future.

## Your timesheet

The Time page shows one week at a time: a bar for each day, the week's total and every entry. Use the arrows to move between weeks. Click the bin next to an entry to delete it.

**CSV** downloads the week on screen as a spreadsheet with the start, end, minutes, task key, task title and note of each entry. Private tasks appear as "Private task (encrypted)".

## Reminders

A reminder is a notification at a time you choose.

To set one on a task, click the alarm clock at the top of its panel and pick **In 1 hour**, **This evening, 6 pm** (offered before 5 pm), **Tomorrow, 9 am** or **Next Monday, 9 am**. When the task has a due time, you can also pick **1 hour before it's due**, **15 minutes before it's due** or **When it's due**. Or choose a date and time and click **Set**. The alarm clock is highlighted while a reminder is waiting, and its menu lists them with an × to cancel each.

To set one that isn't about a task, type in the **Reminders** box on My work, for example "call the bank", and press Enter. It's set for tomorrow at 9 am.

When a reminder comes due, it arrives in your Inbox within a minute, and as a push notification on every device where you turned those on. Reminders can be up to a year ahead, and you can have up to 500 waiting.

If the task later becomes private and you're no longer its creator or assignee, the reminder still arrives, but without the task.

## Push notifications

Push notifications reach your phone or computer even when Nil is closed: reminders, tasks assigned to you, mentions and tasks coming due. Turn them on in **Settings → Notifications** on each device you want them on, and allow them when the browser asks. On an iPhone or iPad, add Nil to your Home Screen first (Share, then Add to Home Screen) and turn them on from there. They need an https address.

On the same tab you can:

- turn off **Show task names in notifications**, so a notification only says what happened, like "A task was assigned to you",
- send a test notification,
- turn push off on all your devices at once.

Notifications travel through the push service of your browser's maker: Google for Chrome and most Android browsers, Apple for Safari, Mozilla for Firefox and Microsoft for Edge. Nil encrypts each one for your device before it leaves the server, so the push service can't read it. It can see that a notification arrived for your device, when, and which server sent it. Every notification is padded to the same size. A private task only ever says "Reminder" or "A private task is due", and the text of a comment is never sent. Signing out on a device stops its notifications.

## What the server stores

Time entries and reminders, including their notes, are stored in plain form in the server's database. The app shows them to nobody but you, but whoever runs the server can read them. See [Privacy model](privacy-model.md).
