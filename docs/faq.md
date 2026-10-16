# FAQ

## Do I need crypto to use Nil?

You need an Ethereum wallet to sign in, but no tokens or ETH. Signing in is a signed message, not a transaction, so it costs nothing. You only need NOX if your workspace lets holders join without an invite, or to have voting power in weighted votes. Admins need tokens in their wallet to pay bounties.

## Why is there no email or password?

Your wallet proves who you are, so Nil never needs to store an email address, a password or a phone number. A copy of the database can't be used to sign in, and there's no password to leak. See [Signing in](signing-in.md).

## What happens if I lose my wallet?

If you lose every wallet linked to your account, you lose the account, and nobody can give it back. Link a second wallet now in **Settings → Sign-in & security**. If you only lose one, sign in with another linked wallet and remove the lost one.

## Can I use Nil on my phone?

Yes. Open your workspace's address in the browser inside your wallet app, then install it from there if you like. WalletConnect isn't supported, so a phone can't sign in for a desktop browser.

## Why does my wallet ask me to sign twice?

The first time you unlock encrypted docs, private tasks, private payouts or anonymous votes, Nil asks for the same signature twice. Your encryption keys are made from that signature, so Nil checks that your wallet produces the same one every time. After that, one signature per browser tab is enough.

## Can admins read my private tasks?

No. Admins can't see private tasks in the app, and the words of a private task are encrypted in the browser, so even the person running the server can't read them. They can see that the task exists, who it's between, and its status, dates and labels. See [Private tasks](private-tasks.md).

## What can the person running the server see?

Everything that isn't encrypted in the browser: team tasks, comments, files, goals, time entries, reminders, the list of people and their wallet addresses. Docs, the words of private tasks and encrypted ballots stay unreadable. [Privacy model](privacy-model.md) has the full list.

## Why can't I attach a file to a private task?

Files aren't encrypted yet. Everything else on a private task is, so Nil keeps files off private tasks rather than store them where the server could read them.

## Does Nil hold our money?

No. Bounties go straight from an admin's wallet to the contributor's wallet. Nil only reads the blockchain to confirm the payment and then signs a receipt. See [Bounties and payouts](bounties-and-payouts.md).

## Why is a payment still confirming?

A payment counts once the block it's in has enough blocks on top of it, 3 by default. That usually takes a minute or two. Nil checks every minute. If the transaction never appears on the blockchain, the payment fails after 24 hours.

## Can I use Nil without NOX at all?

Yes. Tasks, docs, time tracking, reminders, goals, share links and signed one-person-one-vote polls don't involve NOX. A server can turn every on-chain feature off with `NOX_RPC_URL=off`, and a server that doesn't charge runs in community mode with every tool unlocked.

## Is Nil Pro required?

Only on servers that charge for it. If you run Nil yourself, leave `PLAN_TREASURY` unset and everything is unlocked. See [NOX, voting power and Nil Pro](nox-and-nil-pro.md).

## How do I move to another server?

An admin downloads an encrypted capsule in **Settings → Data & privacy** and restores it on the new server before anyone sets it up. Everyone signs in again with the same wallets. See [Backups and moving](backups-and-moving.md).

## Can I use Nil over Tor?

Yes, Nil can run as an onion service. The catch is signing in: Tor Browser has no wallet extension, and adding one has privacy costs. See [Tor onion service](tor.md).

## Has Nil been audited?

No part of Nil's own code has had an independent security audit. Encrypted weighted votes are also marked beta, because their circuit hasn't been audited and their trusted setup was a development ceremony. See [Privacy model](privacy-model.md#honest-limits).

## Is there a dark mode?

No. Nil has a light interface only.

## Is Nil free software?

Yes. Nil is licensed under the GNU Affero General Public License, version 3 or later. You can run, study, change and share it. If you run a modified version for others over a network, you must offer them its source code. The NØNOS foundation makes it.
