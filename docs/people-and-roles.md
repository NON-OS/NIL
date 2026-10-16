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

The sign-in page then offers **Hold NOX? Join without an invite**. Newcomers join as members once the server has checked their wallet. NOX in the wallet, NOX staked in the official staking contract and Zero-State Passes all count.

People who joined this way are checked again at every sign-in, every few hours, and whenever someone new joins through the door, so the same NOX can't let several wallets in one after another. If all their linked wallets together fall below the minimum, they get a notice and a few days (3 by default) with full access to hold enough again. After that they are signed out and can't sign in until they do. To stop checking someone, click **Keep without NOX** next to their name under **Members**. Turn the **Let NOX holders join without an invite** switch off to make the workspace invite-only again.

The token-holder door needs on-chain features turned on, and an active plan on servers that charge for Nil Pro.

## Change a role or remove someone

Admins manage people under **Settings → Team → Members**. Click the role next to someone's name to change it. For a guest, the projects button next to the role sets which projects they see.

**Remove access** stops that person from signing in. Their tasks, comments and history stay in the workspace. A removed person can be brought back with **Restore access**, or deleted for good with **Delete account**. Deleting keeps their tasks and comments but unlinks them from the person, and their proof of work titles can no longer be revealed.

## Your profile

In **Settings → Profile** you can change your name, the line that describes your role on the team (for example "Head of Growth") and the colour of your avatar. You can also turn on desktop notifications there.

Teammates see the name you picked. Only admins can see wallet addresses.
