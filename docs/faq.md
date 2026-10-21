# FAQ

## Do I need crypto to use Nil?

You need an Ethereum wallet to sign in, but no tokens or ETH. Signing in is a signed message, not a transaction, so it costs nothing. You only need NOX if your workspace lets holders join without an invite, or to have voting power in weighted votes. Admins need tokens in their wallet to pay bounties.

## Why is there no email or password?

Your wallet proves who you are, so Nil never needs to store an email address, a password or a phone number. A copy of the database can't be used to sign in, and there's no password to leak. See [Signing in](signing-in.md).

## What happens if I lose my wallet?

If you only lose one, sign in with another linked wallet and remove the lost one. If you lose every wallet linked to your account, ask an admin to reset your sign-in: they send you a one-time link that lets you link a new wallet to the same account. Save yourself that step by linking a second wallet now in **Settings → Sign-in & security**. See [Signing in](signing-in.md#if-you-lose-every-wallet).

Your encryption keys work the same way. Any wallet or passkey you've added to them unlocks them. If you lose all of those, your recovery kit brings them back; without one, you start over with new keys. See [Keep a recovery kit](signing-in.md#keep-a-recovery-kit).

## Can I use Nil on my phone?

Yes. Open your workspace's address in the browser inside your wallet app, then install it from there if you like. On a computer without a wallet, a server with WalletConnect on also lets the wallet app on your phone sign for the computer: see [Use a wallet on your phone](signing-in.md#use-a-wallet-on-your-phone).

## Why does my wallet ask me to sign twice?

Your encryption keys are stored locked to each of your wallets, and a wallet's signature of its unlock message is what opens them. So when a wallet is added to your keys, Nil asks it to sign that message twice and checks that both signatures match. The very first time, there's a third signature, which publishes your public keys so teammates can check them. After that, one signature per browser tab is enough.

## Why does Nil ask me to check a teammate's keys?

Your browser gets teammates' public keys from the server. Comparing a key's fingerprint with its owner, face to face or on a call, makes sure the server didn't swap in a key of its own. Nil shares nothing with a key until you've confirmed it. See [Check your teammates' keys](encrypted-docs.md#check-your-teammates-keys).

## Can admins read my private tasks?

No. Admins can't see private tasks in the app, and the words of a private task are encrypted in the browser, so even the person running the server can't read them. They can see that the task exists, who it's between, and its status, dates and labels. See [Private tasks](private-tasks.md).

## What can the person running the server see?

Everything that isn't encrypted in the browser: team tasks, comments, files, goals, time entries, reminders, the list of people and their wallet addresses. Docs, the words of private tasks and encrypted ballots stay unreadable. [Privacy model](privacy-model.md) has the full list.

## Are files on a private task encrypted?

Yes. Your browser encrypts each file, with its name and type, before it uploads, so the server only ever holds scrambled data. It can still see roughly how big each file is. Files on team tasks are stored as uploaded. See [Private tasks](private-tasks.md).

## Does Nil hold our money?

No. Bounties go straight from an admin's wallet to the contributor's wallet. Nil only reads the blockchain to confirm the payment and then signs a receipt. See [Bounties and payouts](bounties-and-payouts.md).

## Why is a payment still confirming?

A payment counts once the block it's in has enough blocks on top of it, 3 by default. That usually takes a minute or two. Nil checks every minute. If the transaction never appears on the blockchain, the payment fails after 24 hours.

## Can I use Nil without NOX at all?

Yes. Tasks, docs, time tracking, reminders, goals, share links and signed one-person-one-vote polls don't involve NOX. A server can turn every on-chain feature off with `NOX_RPC_URL=off`, and a server that doesn't charge runs in community mode with every tool unlocked.

## Is Nil Pro required?

Only on servers that charge for it. If you run Nil yourself, leave `PLAN_TREASURY` unset and everything is unlocked. See [NOX, voting power and Nil Pro](nox-and-nil-pro.md).

## How do I move to another server?

An admin downloads an encrypted capsule in **Settings → Data & privacy** and restores it on the new server before anyone sets it up. Everyone signs in again with the same wallets. Keep the same web address if you can: at a new address, each person restores their encryption keys from their recovery kit once. See [Backups and moving](backups-and-moving.md#move-to-a-new-server).

## Can I use Nil over Tor?

Yes, Nil can run as an onion service. The catch is signing in: Tor Browser has no wallet extension, and adding one has privacy costs. See [Tor onion service](tor.md).

## Has Nil been audited?

No part of Nil's own code has had an independent security audit. Encrypted weighted votes are also marked beta, because their circuit hasn't been audited and their trusted setup was a development ceremony. See [Privacy model](privacy-model.md#honest-limits).

## Is there a dark mode?

No. Nil has a light interface only.

## Is Nil open source?

Its source is available, under the Business Source License 1.1. Anyone can read and audit the code, and check that a server runs exactly a published release. Running it in production, hosting it for others or offering a fork as a service needs a license from NØNOS, which makes it. Four years after each version is published, that version becomes available under the GNU Affero General Public License v3 or later.
