# Bounties and payouts

A bounty is a reward on a task, paid in NOX, USDC or another token the server lists. An admin's own wallet sends it straight to the contributor's wallet. Nil never holds the money: the server only reads the blockchain to confirm the payment happened, then signs a receipt for it.

## Put a bounty on a task

Only admins can set bounties. Open the task, type an amount like 250 or 12.5 in its **Bounty** field, and pick the token under **Paid in**. Press Enter or click elsewhere to save. To remove a bounty, clear the field.

Once a payment for a bounty has been recorded, the bounty can't change.

On a server that charges for [Nil Pro](nox-and-nil-pro.md), adding a bounty needs an active plan. Bounties that already exist can always be paid.

## Take a bounty

The **Bounties** page lists **Open bounties**. One without an assignee is up for grabs: click **Take it** and the task is yours to deliver. Admins pay you once the work is done.

## Pay a bounty

When the work is done, an admin opens the task, or finds it under **Ready to pay** on the Bounties page, and clicks **Pay** followed by the amount and the contributor's name.

1. Nil first checks that the wallet you have open is linked to your account or is a treasury address, so you never send money it would refuse to count. Your wallet switches to the right network if needed, then shows a token transfer to the contributor's wallet. Check it and approve it.
2. Nil records the transaction and checks it on the blockchain. The bounty shows as confirming.
3. Once the transaction has enough confirmations (3 blocks by default), the bounty shows as paid. This usually takes a minute or two.

The contributor gets a notification and a signed payment receipt in their [proof of work](proof-of-work.md).

The money goes to the first wallet linked to the contributor's account, unless they turned on [private payouts](private-payouts.md). Then the button says **privately** and the money goes to a new one-time address that only they can open.

To pay, the task needs an assignee with a linked wallet. If nobody is assigned yet, assign someone or list the bounty on the [public bounty board](public-bounty-board.md).

## Pay from a team treasury or another wallet

Teams often pay from a shared wallet such as a Safe multisig. To allow that, add its address under **Treasury addresses** at the bottom of the Bounties page. You can add up to 10. Payments from those addresses count, as well as payments from any admin's own wallets.

After paying from such a wallet, open the task, click **Paid another way?**, paste the transaction hash and click **Record payment**.

## When a payment isn't accepted

Each payment appears in the **Payments** list on the Bounties page as **Confirming**, **Confirmed** or **Not accepted**. A payment isn't accepted when:

- the transaction failed on the blockchain,
- it doesn't move that token to the contributor's address,
- the tokens came from a wallet that isn't the paying admin's or a treasury address,
- it sent less than the bounty,
- it never showed up on the blockchain within 24 hours.

The list shows the reason. Fix the cause, click **Remove** on the failed payment and record the right transaction. For a payment that is still confirming, **Check now** checks it straight away instead of waiting for the next check, which happens every minute.

## The Bounties page

The tiles at the top add up open bounties, bounties ready to pay, what has been paid out (for members, what you earned) and how many bounties nobody has taken. Amounts in different tokens are shown separately.

Below that come these sections:

| Section | What it shows |
|---|---|
| Ready to pay | Finished tasks with an unpaid bounty |
| Open bounties | Bounties on unfinished tasks |
| Per person | What each person was promised, is owed and was paid, per token. Members see only their own row, under the heading Your earnings |
| Your private payouts | Bounties paid to you at one-time addresses, if you have any |
| Payments | Every transfer Nil checked, with a link to it on a block explorer. Only admins and the person paid can see a payment, because a transaction reveals the wallet that received it |
| Treasury addresses | Extra addresses allowed to pay bounties. Admins only |

**Public board** at the top opens the [public bounty board](public-bounty-board.md).

## How the check works

A payment counts only when all of these hold: the right token contract moved at least the full amount, the tokens came from the wallet of the admin who recorded it or from a treasury address, they went to the contributor's address, and the block has enough confirmations on top of it (`NOX_CONFIRMATIONS`, 3 by default). The server reads the chain through its Ethereum node. Pending payments are checked again every minute, and a transaction that never appears fails after 24 hours. A transaction hash can be recorded for only one payment.

Bounties can be paid in NOX or in any token on the server's reward list, set with `REWARD_TOKENS`. NOX always comes first, and USDC on Ethereum mainnet is on the list by default. Each task carries its own reward token, payments are checked against that token's contract, and totals, receipts, decks and notifications keep each token separate.
