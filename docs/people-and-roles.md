# People and roles

Everyone in a workspace has one of four roles. The first wallet to set up a new server becomes the owner.

## Roles

| Role | What they can do |
|---|---|
| Owner | Everything an admin can, plus make other people owners and erase the whole workspace |
| Admin | Invite and remove people, change roles, set and pay bounties, start votes, change workspace settings, delete projects, download encrypted capsules |
| Member | Work on tasks, projects, goals and docs, vote, and invite people if admins allow it |
| Guest | See and work on only the projects shared with them and the tasks assigned to them |

Only an owner can make someone an owner or change another owner's role. Nobody can change their own role or remove their own access, so a workspace should have at least two admins, ideally two owners.

## Invite people

1. Open **Settings → Team**.
2. Under **Invite people**, pick a role. For a guest, also click **Pick projects** and choose what they can see.
3. Click **Create invite link**. Nil copies the link for you.
4. Send it privately. Whoever opens it first joins with their wallet.

An invite link works once and expires after 7 days. Pending links are listed under the button, each with a **Revoke** button. The server keeps only a hash of each link, never the link itself.

Admins can invite admins, members and guests. When an admin turns on **Members can invite people** under **Sharing**, members can invite members and guests too. They see and revoke only the links they made.

On a server that charges for [Nil Pro](nox-and-nil-pro.md), a workspace without Pro can't grow past its free seats (5 by default), and with paid Pro it can have as many people as the plan covers. Letting someone back in or making a guest a member takes a seat too. Guests never take a seat.

## Let NOX holders join without an invite

Admins can open the workspace to anyone who holds enough NOX:

1. In **Settings → Team → Token holders**, type the **Minimum** amount.
2. Click **Open the door**.

The sign-in page then offers **Have NOX tokens? Join without an invite**. Newcomers join as members once the server has checked their wallet. NOX in the wallet, NOX staked in the official staking contract and Zero-State Passes all count.

People who joined this way are checked again at every sign-in, every few hours, and whenever someone new joins through the door, so the same NOX can't let several wallets in one after another. If all their linked wallets together fall below the minimum, they get a notice and a few days (3 by default) with full access to hold enough again. After that they are signed out and can't sign in until they do. To stop checking someone, click **Keep without NOX** next to their name under **Members**. Turn the **Let NOX holders join without an invite** switch off to make the workspace invite-only again.

The token-holder door needs on-chain features turned on, and an active plan on servers that charge for Nil Pro.

## Change a role or remove someone

Admins manage people under **Settings → Team → Members**. Click the role next to someone's name to change it. For a guest, the projects button next to the role sets which projects they see.

**Remove access** stops that person from signing in. Their tasks, comments and history stay in the workspace. A removed person can be brought back with **Restore access**, or deleted for good with **Delete account**. Deleting keeps their tasks and comments but unlinks them from the person, and their proof of work titles can no longer be revealed.

## Reset someone's sign-in

When someone loses every wallet linked to their account, click **Reset sign-in** next to their name and confirm. Nil shows a link once, as text and as a QR code. Send it to them privately, or let them scan it in person. It works once and expires after `SIGNIN_RESET_HOURS` (24). Whoever opens it can link a new wallet to that account and sign in as that person, so make sure it reaches the right one. Their account stays the same, and they are signed out everywhere else.

Owners are protected:

- With two or more admins besides the owner, one asks and another approves. The request waits under **Sign-in resets**, where any other admin can **Approve** it and gets the link. Nobody can approve their own request or a reset of their own sign-in.
- With only one other admin, there is nobody to approve. Nil warns that the link hands over the whole workspace and asks that admin to confirm before making it.

Any admin can **Cancel** an open reset, including the person being reset if they can still sign in. **Sign-in history** lists every request, approval, link, cancel and use, and every wallet linked or removed, by name only.

A reset doesn't bring back the person's encryption keys. They restore them from their [recovery kit](signing-in.md#keep-a-recovery-kit), or set up new keys. New keys show up for everyone as a changed key, and each teammate's browser shares nothing with them until that teammate has checked the new key with them.

## Your profile

In **Settings → Profile** you can change your name, the line that describes your role on the team (for example "Head of Growth") and the colour of your avatar. Notifications have their own tab, **Settings → Notifications**, described in [Time and reminders](time-and-reminders.md#push-notifications).

Teammates see the name you picked. Only admins can see wallet addresses.
