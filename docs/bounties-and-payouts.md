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

1. Nil first checks that the wallet you have open is linked to your account or is a treasury address, so you never send money it would refuse to count. Then it works out exactly what to send: what's still owed, ending in a few extra digits that identify this payment (for example 250.00004817 NOX). Your wallet switches to the right network if needed, then shows a token transfer of that amount to the contributor's wallet. Check it and approve it.
2. Nil records the transaction and checks it on the blockchain. The bounty shows as confirming.
3. Once the block holding the transaction is final, the bounty shows as paid. On Ethereum this usually takes under 15 minutes.

The contributor gets a notification and a signed payment receipt in their [proof of work](proof-of-work.md).

The money goes to the first wallet linked to the contributor's account, unless they turned on [private payouts](private-payouts.md). Then the button says **privately** and the money goes to a new one-time address that only they can open.

On a server with pool payouts on, admins also see **From pool** next to **Pay** for a contributor with private payouts. It pays the bounty out of the team's [Privacy Pools](private-payouts.md#pay-from-the-teams-pool) pool through a relayer, so no team wallet sends it and the chain doesn't link the team to the contributor. The dialog shows the bounty, the relayer's fee on top and the total that leaves the pool before anything is sent.

To pay, the task needs an assignee with a linked wallet. If nobody is assigned yet, assign someone or list the bounty on the [public bounty board](public-bounty-board.md).

## Pay from a team treasury or another wallet

Teams often pay from a shared wallet such as a Safe multisig. To allow that, add its address under **Treasury addresses** at the bottom of the Bounties page. You can add up to 10. Payments from those addresses count, as well as payments from any admin's own wallets.

To pay from such a wallet, open the task, click **Paid another way?** and then **Get the exact amount to send**. Send exactly that amount, last digits included, to the address shown, then paste the transaction hash and click **Record payment**. The amount stays good for 14 days (`PAYMENT_INTENT_DAYS`), long enough for a multisig to collect its signatures.

## When a payment isn't accepted

Each payment appears in the **Payments** list on the Bounties page as **Waiting to be mined**, **Confirming**, **Confirmed**, **Confirmed, short**, **Confirmed, overpaid**, **Not accepted** or **Cancelled**. A payment isn't accepted when:

- the transaction failed on the blockchain,
- it doesn't move that token to the contributor's address,
- the tokens came from a wallet that isn't the paying admin's or a treasury address (or, for a payout from the team's pool, the transaction isn't a withdrawal from the token's pool through the entry contract to the one-time address),
- the amount doesn't end in the digits Nil asked for, so it can't be told apart from a payment made for something else,
- it was mined before the payment was started in Nil,
- it never showed up on the blockchain within 24 hours (`NOX_MISSING_TX_HOURS`).

The list shows the reason. Fix the cause, click **Remove** on the failed payment and pay again. For a payment that is still waiting, **Check now** checks it straight away instead of waiting for the next check, which happens every minute.

If less arrived than was asked for, the payment is confirmed as part of the bounty and the bounty shows as partly paid. Click **Pay the rest** to send what's still owed. If more arrived, the bounty is paid and the payment shows as overpaid.

If NOX's governance switches on a fee for transfers between wallets, the NOX token keeps that share of every payment, so the exact amount Nil asks for arrives short by it. Admins see a notice on the Bounties page while that's the case. Nil still recognises a payment short by exactly the fee and counts it as paid in full; the Payments list shows what arrived and what the token kept. The contributor receives that much less than the bounty.

A transaction that is stuck and never gets mined can be cancelled: click **Cancel** on it, then pay again. Before that, it's best to speed the transaction up or cancel it in your wallet, so it can't land later. If it does land anyway, Nil still counts it for 7 days (`PAYMENT_WATCH_DAYS`), so the record always shows money that moved. A transaction that is already in a block can't be cancelled.

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
| Team pool | The team's Privacy Pools pool: what it holds, each deposit and whether the association set approved it, deposits, ragequits and recovery. Admins only, on a server with pool payouts on |
| Treasury addresses | Extra addresses allowed to pay bounties. Admins only |

**Public board** at the top opens the [public bounty board](public-bounty-board.md).

## How the check works

A payment counts only when all of these hold: the right token contract moved the tokens, they came from the wallet of the admin who recorded it or from a treasury address, they went to the contributor's address (or the one-time address of a private payout), the transaction was mined after the payment was started in Nil, the amount ends in the digits Nil asked for, and the block is final. The server reads the chain through its Ethereum node and asks it for the finalized block; on a node or chain without one, a block counts as final 64 blocks under the newest one (`NOX_FINALITY_DEPTH`). Until then it keeps the block's hash and checks it again, so a transaction that a chain reorganisation moves or drops is followed rather than counted too early.

A payout from the team's pool comes from the Privacy Pools entry contract rather than a team wallet. It counts only when the configured pool for the token emitted the withdrawal to the entry contract, the entry contract sent the token to the payout's one-time address, and its WithdrawalRelayed event names that address, the token, the amount and the relayer's fee, with exactly the amount less the fee arriving. That amount has to be the one Nil asked for, digits included: the browser withdraws enough that the contributor receives exactly that, and the team pays the fee on top. Instead of the payer's wallet, the check rests on the one-time address, which only this payment was told about. The rest (the start block, finality, reorgs) is the same as for any payment, and the Payments list shows what the relayer kept.

A transaction can pay only one thing: one bounty, or one [Nil Pro](nox-and-nil-pro.md) invoice. The starting block and the identifying digits also mean a payment made in one workspace can't be passed off as one made in another. Recording the same transaction twice for the same payment changes nothing. Pending payments are checked again every minute.

Bounties can be paid in NOX or in any token on the server's reward list, set with `REWARD_TOKENS`. NOX always comes first, and USDC on Ethereum mainnet is on the list by default. Each task carries its own reward token, payments are checked against that token's contract, and totals, receipts, decks and notifications keep each token separate.
