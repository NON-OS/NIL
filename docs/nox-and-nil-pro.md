# NOX, voting power and Nil Pro

NOX is a token on Ethereum (an ERC-20 token). Nil uses it in a few places: bounties can be paid in it, it gives voting power, it can open the workspace to holders, and on servers that charge for Nil Pro it pays for less and holding it brings perks. You can use Nil without holding any NOX.

## The token

By default Nil uses the NOX contract `0x0a26c80be4e060e688d7c23addb92cbb5d2c9eca` on Ethereum mainnet, with 18 decimals. The token's governance can switch on a fee of up to 3% for transfers between wallets; today it is 0. Nil reads it from the token every 10 minutes. While there is one, admins see a notice, and a payment that arrives short by exactly that fee still counts as paid, for bounties and Nil Pro alike, as long as the same transaction shows the token keeping that fee from the sender. The fee that counts is the one in force in the payment's own block. A reading above 3% (`NOX_MAX_TRANSFER_FEE_BPS`) is taken for a misread, and then no payment counts as short by a fee. The server reads balances and payments through its Ethereum node. Whoever runs the server can change the token, the network and the node, or turn every on-chain feature off with `NOX_RPC_URL=off`. With on-chain features off, there are no bounty payments, private payouts, token-holder door, weighted votes or paid plan.

## Voting power

Votes can count one per person, or by voting power. Each member's voting power is:

```
NOX in linked wallets + NOX staked + Zero-State Passes held × power per pass
```

NOX in linked wallets is the balance of every wallet linked to the member's account. NOX staked is what those wallets have staked in the official NOX staking contract. A Zero-State Pass (ZSP) is an NFT, and each one held by a member's wallets adds a fixed amount of power.

Admins set the power per pass in **Settings → Team → Voting power**, under **Power per Zero-State Pass, in NOX**. The default is 100,000 NOX per pass.

Power is read when a vote opens, for every member at the same block: the newest final one, named by its hash, so a chain reorganisation can't mix two versions of it. On Ethereum that block is usually about 15 minutes old, so tokens that moved in those last minutes count where they were before. Tokens moved after that can't count twice, and people who join later have no power in that vote. Each vote also keeps the power per pass that applied when it opened, so changing the setting never changes a vote that's already running. Encrypted weighted votes count whole NOX only.

The staking contract is read with `getStakeInfo` (default `0xa94d6009790Ba13597A1E1b7cF4e1531eA513613`) and the pass contract with `balanceOf` (default `0x7b575dd8e8b111c52ab1e872924d4efd4df403df`). The operator can change either, or leave one out by setting it to `off`.

## The token-holder door

Admins can let anyone holding a minimum amount of NOX join without an invite. NOX in the wallet, NOX staked in the official staking contract and Zero-State Passes all count toward the minimum; one pass counts as 100,000 NOX by default (`HOLDER_ZSP_NOX`).

Members who came in this way keep being checked: at every sign-in, every few hours (`HOLDER_RECHECK_HOURS`), and whenever someone new joins through the door. That way one stack of NOX can't let several wallets in one after another. Someone who falls below the minimum isn't locked out on the spot: they get a notice and 3 days (`HOLDER_GRACE_DAYS`) with full access to hold enough again. After that they are signed out and can't sign in until they do. An admin can let a member stay without the check. See [People and roles](people-and-roles.md#let-nox-holders-join-without-an-invite).

## Nil Pro

Nil Pro is the paid plan. Whether you ever see it depends on the server.

### Community mode

A server that hasn't set a treasury address (`PLAN_TREASURY`) runs in community mode: every tool is unlocked and nothing is charged. This is the normal way to run Nil yourself, and the AGPL licence lets anyone run it this way. **Settings → Plan** then says **Community mode**.

### On a server that charges

A server that sets a treasury, such as the hosted service the NØNOS foundation runs, asks each workspace to pay for Nil Pro. On the foundation's hosted Nil, payments go to the NØNOS DAO treasury at `0x9B90166E484a5C57608D3b2e78B79e10dA92c3b7`, which anyone can check on a block explorer.

- The price is in US dollars: a flat fee per period ($12 per 30 days by default) plus a price per person above the free seats ($3 each by default, with 5 free seats). Guests never count.
- You pay in USDC at face value, or in NOX for less (20% off by default).
- A free trial runs when the workspace first appears on the server, 14 days by default including the grace days. Erasing the workspace or restoring a capsule never starts another trial.
- After paid time or the trial runs out, a grace period (7 days by default) keeps the paid tools working while you renew. Owners and admins get a reminder 7 days and 1 day before it runs out. Pro from a Zero-State Pass has no grace period.
- Nothing renews by itself, and no card or email is ever asked for.

**Settings → Plan** shows where you stand: **Trial**, **Pro until** a date, **Pro with a Zero-State Pass**, **Grace period** with the day the tools pause, or **Paid tools paused**. It also shows the price and how many people the plan covers.

### What NOX holders get

- A Zero-State Pass gives Pro. If the owner or an admin holds a Zero-State Pass in a wallet linked to their account, the workspace has Nil Pro without paying. Nil checks every few hours, each time at a moment nobody can predict, between 3 and 6 hours after the last check by default (`PLAN_PERK_CHECK_HOURS`). Pro starts once the checks have kept finding a pass for at least 6 hours, so it can take up to about 12 hours after you get one. If the pass is sold, Pro ends at the first check that doesn't find it, with no grace period and no more people than the plan otherwise covers. A pass held only for a moment, or lent from one workspace to the next, gives no Pro.
- Staking takes money off. When an admin stakes NOX in the official staking contract, invoices cost less: 10% off from 10,000 NOX staked, 25% off from 100,000, by default (`PLAN_STAKER_TIERS`). The highest tier any one admin reaches applies; two admins can't add their stakes together. A stake counts at a tier once the same checks have kept seeing it there for at least 6 hours, and only if it's still there when the invoice is made. The discount is then locked into the invoice.
- A staking or pass contract that refuses to answer (paused or replaced, say) counts as no stake and no pass, the same as in a vote snapshot, so invoices can always be made. When NOX can't be priced and no manual rate is set, invoices are offered in USDC only, with a notice saying so.
- Paying in NOX costs less than paying in USDC.

### Pay for Nil Pro

Admins pay from **Settings → Plan**:

1. Under **Get Nil Pro**, choose how long to pay for and how many people the plan covers. The price shows line by line before anything is made: the flat fee, the seats, the staker discount, any credit, and what that comes to in USDC and in NOX.
2. Click **Make the invoice**. It's open for 24 hours, and the NOX rate and discounts are locked for that time.
3. Pay one of the amounts shown, in one of three ways:
   - From this browser's wallet: click **Pay from this browser's wallet** and approve the transfer.
   - From a phone wallet: scan the QR code. It opens the transfer, amount and all.
   - From an exchange or any other wallet: copy the exact amount and the treasury address and send it. If you have the transaction hash, paste it under the invoice to have it found at once.

Send the exact amount. Its last few digits (for example the 4817 in 12.004817 USDC) tell your payment apart from everyone else's paying the same treasury, which is how a payment from any wallet or exchange finds its invoice. An exchange that rounds the amount can't be matched, so use one that sends it as is.

The invoice then shows where it stands: **Waiting for payment**, **Seen, not mined yet**, **Confirming** (the payment is in a block that isn't final yet, usually under 15 minutes on Ethereum), and **Paid**. A payment counts only once its block is final.

If a chain reorganisation takes the transaction out of its block, or the server's node briefly can't find it, the payment stops counting toward the invoice, but Nil keeps looking for it for 7 days (`PLAN_LATE_DAYS`) and counts it as soon as it's in a block again. Pasting its hash under the invoice again looks once more, even after that.

- Underpaid: if less arrived, the invoice shows what's missing and the exact amount to send to finish. It ends in the same digits, so it's matched to the same invoice.
- Overpaid: if more arrived, the extra isn't lost. It buys extra days in proportion: paying $15 for a $10 period gives a period and a half.
- Expired or cancelled: whatever an invoice received before it expired, or after, becomes credit. Click **Make again** to get a new invoice at today's price with the credit taken off. NOX that arrives after its invoice expired counts at the lower of the locked rate and today's.

Under- and overpayments from any wallet are matched automatically on hosted servers that give each workspace its own share of suffixes (`PLAN_INVOICE_SLOT`). Elsewhere, paste the transaction hash under the invoice: an under- or overpayment sent from a wallet linked to someone in the workspace is then matched the same way. Without a share of their own, other workspaces paying the same treasury draw from the same suffixes, so one sent from an exchange or anyone else's wallet can't be told apart from theirs and isn't counted; send the exact amount instead. A transaction you paste pays only the invoice you pasted it under.

The invoice list keeps every invoice with its transactions and a link to check each one on a block explorer.

### Where the money goes

Under **Where the money goes**, admins see what the workspace has paid the treasury for Nil Pro and the share of that revenue that buys and burns NOX, as published by whoever runs the server (`BURN_SHARE`).

On the NØNOS foundation's hosted service, the burn works like this. The foundation does it by hand, from the treasury: it takes the published share of the Nil Pro revenue received since the last burn, buys NOX on the open market with it, and sends that NOX to a burn address, one nobody holds a key to, so it can never move again. Every purchase and burn is an ordinary public transaction, and the foundation publishes them (`BURN_REPORT_URL`) so anyone can add them up against the treasury's incoming payments. No contract does this automatically, and Nil itself never moves treasury funds.

### What needs Nil Pro

- new bounties, and listing bounties on the public board,
- starting new votes,
- the token-holder door,
- the built-in AI,
- connecting AI assistants over MCP,
- more people than the free seats, 5 by default. Guests never count. With paid Pro, the team can have as many people as the plan covers; to add more before it runs out, choose **More seats now** and pay for the rest of the paid time.

### What never needs it

Tasks, projects, goals, encrypted docs, time tracking, reminders, share links, reading and exporting are always free. So is paying bounties that were already promised, and finishing votes that are already open: casting ballots, closing them and decrypting the totals.

When the paid tools are paused, the pages that use them show a notice, such as "New bounties need Nil Pro. Everything already here stays readable." Admins see a **Renew plan** button next to it.
