# People and roles

Everyone in a workspace has one of four roles. The first wallet to set up a new server becomes the owner.

## Roles

| Role | What they can do |
|---|---|
| Owner | Everything an admin can, plus make other people owners, manage admins and erase the whole workspace |
| Admin | Invite and remove members and guests, change their roles, set and pay bounties, start votes, change workspace settings, delete projects, download encrypted capsules |
| Member | Work on tasks, projects, goals and docs, vote, and invite people if admins allow it |
| Guest | See and work on only the projects shared with them and the tasks assigned to them |

Only an owner can make someone an owner, or change the role of, remove or delete another owner or admin. Admins can make a member an admin, but can't undo it. Nobody can change their own role or remove their own access, so a workspace should have at least two admins, ideally two owners.

## Invite people

1. Open **Settings → Team**.
2. Under **Invite people**, pick a role. For a guest, also click **Pick projects** and choose what they can see.
3. Click **Create invite link**. Nil copies the link for you.
4. Send it privately. Whoever opens it first joins with their wallet.

An invite link works once and expires after 7 days. Pending links are listed under the button, each with a **Revoke** button. The server keeps only a hash of each link, never the link itself.

Admins can invite admins, members and guests. When an admin turns on **Members can invite people** under **Sharing**, members can invite members and guests too. They see and revoke only the links they made.

Links stop working when the person who made them can no longer make them: an admin's links are revoked when they stop being an admin, and anyone's links when their access is removed. When a link is used, Nil also checks that whoever made it still has access and, for an admin invite, is still an admin.

On a server that charges for [Nil Pro](nox-and-nil-pro.md), a workspace without Pro can't grow past its free seats (5 by default), and with paid Pro it can have as many people as the plan covers. Letting someone back in or making a guest a member takes a seat too. Guests never take a seat.

## Let NOX holders join without an invite

Admins can open the workspace to anyone who holds enough NOX:

1. In **Settings → Team → Token holders**, type the **Minimum** amount.
2. Click **Open the door**.

The sign-in page then offers **Have NOX tokens? Join without an invite**. Newcomers join as members once the server has checked their wallet. NOX in the wallet, NOX staked in the official staking contract and Zero-State Passes all count. Nil reads them at the newest final block, which on Ethereum is usually about 15 minutes old, so NOX that only just arrived counts a little later.

People who joined this way are checked again at every sign-in, every few hours (6 by default), and whenever someone new joins through the door. The regular checks look at all of them at the same final block, so one stack of NOX counts for one of them at a time.

If all their linked wallets together fall below the minimum, they get a notice and a few days (3 by default) with full access to hold enough again. After that they are signed out, their access keys stop working, and they can't sign in until they hold enough again.

Holding enough again only counts once the regular checks have seen it, never just at the moment someone signs in, so the same NOX can't be passed from wallet to wallet in time for each person's sign-in:

- Someone whose grace period ran out can sign in again once the checks have seen enough in their wallets for 6 hours.
- The grace period only starts over once the checks have seen them hold enough for a whole grace period. If they fall below again before that, the first grace period still applies.

Each wallet's NOX counts for one person at a time. Nil remembers whom a wallet's NOX last counted for, even after the wallet is unlinked, and for a grace period after that it counts for nobody else and can't be used to join through the door. So a stack that never moves can't be linked to account after account.

If the staking or pass contract refuses to answer (it's paused, say), stakes or passes count as nothing until it answers again, the same as when a vote opens. If Nil can't reach its Ethereum node at all, nobody is let in through the door and nobody loses their place.

None of this touches members who keep their NOX in a linked wallet. Moving NOX between your own linked wallets isn't falling below; to move it to a new wallet, link that wallet first. What the door can't do is follow tokens from wallet to wallet: someone who moves the same NOX to fresh wallets can still join as new people one after another, but each of those accounts is signed out once its grace period runs out, and every join shows under **Members**.

To stop checking someone, click **Keep without NOX** next to their name under **Members**. Turn the **Let NOX holders join without an invite** switch off to make the workspace invite-only again.

The token-holder door needs on-chain features turned on, and an active plan on servers that charge for Nil Pro.

## Change a role or remove someone

Admins manage people under **Settings → Team → Members**. Click the role next to someone's name to change it. For a guest, the projects button next to the role sets which projects they see. Only owners see these buttons on an admin's or another owner's row.

**Remove access** stops that person from signing in, ends their sessions and revokes the invite links they made. Their tasks, comments and history stay in the workspace. When an admin is demoted or loses access, the sign-in resets they asked for or approved that nobody used yet are closed too. A removed person can be brought back with **Restore access**, or deleted for good with **Delete account**. Deleting keeps their tasks and comments but unlinks them from the person, and their proof of work titles can no longer be revealed.

## Reset someone's sign-in

When someone loses every wallet linked to their account, click **Reset sign-in** next to their name and confirm. Nil shows a link once, as text and as a QR code. Send it to them privately, or let them scan it in person. It works once and expires after `SIGNIN_RESET_HOURS` (24). Whoever opens it can link a new wallet to that account and sign in as that person, so make sure it reaches the right one. Their account stays the same, they are signed out everywhere else, and their access keys are revoked. The link stops working if the admin who made or approved it stops being an admin first. Agents never sign in, so they have no reset.

Owners are protected. When an admin asks to reset an owner, the owner and every other owner and admin get a notification, on their phone too if they turned push on, and the request waits under **Sign-in resets**:

- With two or more admins besides the owner, another admin has to **Approve** it, and gets the link. Admins who lost the role in the last 72 hours still count toward the two, so removing an admin doesn't switch approval off. Approving takes an admin who has been one for at least 72 hours and whose own sign-in wasn't reset in that time, so nobody can make or take over an admin just to approve. Nobody can approve their own request or a reset of their own sign-in.
- With fewer, there is nobody to approve. Nil warns that the link hands over the whole workspace, and if the admin goes ahead, the reset waits 72 hours. After that, the admin who asked clicks **Make the link** to get it, within a day. Nobody else can.

The 72 hours are `SIGNIN_OWNER_RESET_WAIT_HOURS`. Any admin can **Cancel** an open reset, including the owner being reset if they can still sign in, so an owner who still has their wallet can stop one they didn't ask for. **Sign-in history** lists every request, approval, link, cancel and use, and every wallet linked or removed, by name only.

A reset doesn't bring back the person's encryption keys. They restore them from their [recovery kit](signing-in.md#keep-a-recovery-kit), or set up new keys. New keys show up for everyone as a changed key, and each teammate's browser shares nothing with them until that teammate has checked the new key with them.

## Your profile

In **Settings → Profile** you can change your name, the line that describes your role on the team (for example "Head of Growth") and the colour of your avatar. Notifications have their own tab, **Settings → Notifications**, described in [Time and reminders](time-and-reminders.md#push-notifications).

Teammates see the name you picked. Only admins can see wallet addresses.
